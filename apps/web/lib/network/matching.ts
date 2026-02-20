import { supabaseAdmin } from "@/lib/auth";

/**
 * Normalize a company name for comparison:
 * lowercase, strip common suffixes, trim whitespace.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(inc\.?|llc\.?|corp\.?|corporation|co\.?|ltd\.?|limited|group|holdings|plc)\b/gi,
      ""
    )
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a normalized domain from a company name.
 * e.g. "Google Inc." → "google.com"
 */
export function normalizeCompanyDomain(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return cleaned.length > 0 ? `${cleaned}.com` : "";
}

/**
 * Check whether two company identifiers match.
 * Compares normalized names and derived domains.
 */
export function companiesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  const domA = normalizeCompanyDomain(a);
  const domB = normalizeCompanyDomain(b);
  if (domA && domB && domA === domB) return true;
  return false;
}

/**
 * Keyword-based industry overlap: checks if any contact industry
 * appears in the post's skills or description.
 */
export function industryOverlaps(
  contactIndustries: string[],
  postSkills: string[],
  postDescription: string
): boolean {
  if (!contactIndustries || contactIndustries.length === 0) return false;
  const haystack = [
    ...(postSkills || []).map((s) => s.toLowerCase()),
    (postDescription || "").toLowerCase(),
  ].join(" ");
  return contactIndustries.some((ind) => haystack.includes(ind.toLowerCase()));
}

/**
 * Find matches for a single network contact across all job posts
 * for the AM's assigned seekers.
 */
export async function findMatchesForContact(contactId: string) {
  // 1. Load contact
  const { data: contact, error: cErr } = await supabaseAdmin
    .from("network_contacts")
    .select("*")
    .eq("id", contactId)
    .single();
  if (cErr || !contact) return;

  // 2. Get AM's assigned seekers
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", contact.account_manager_id);
  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id);
  if (seekerIds.length === 0) return;

  // 3. Load job posts that are matched to those seekers (via job_match_scores)
  const { data: scores } = await supabaseAdmin
    .from("job_match_scores")
    .select("job_post_id, job_seeker_id")
    .in("job_seeker_id", seekerIds);
  if (!scores || scores.length === 0) return;

  const postIds = [...new Set(scores.map((s) => s.job_post_id))];

  const { data: posts } = await supabaseAdmin
    .from("job_posts")
    .select(
      "id, title, company, description_text, required_skills, preferred_skills, industry"
    )
    .in("id", postIds);
  if (!posts || posts.length === 0) return;

  // 4. For each post, check for match
  const matchRows: {
    network_contact_id: string;
    job_post_id: string;
    job_seeker_id: string;
    match_reason: string;
  }[] = [];

  // Build a map: postId → seekerIds
  const postSeekerMap = new Map<string, string[]>();
  for (const s of scores) {
    const arr = postSeekerMap.get(s.job_post_id) || [];
    arr.push(s.job_seeker_id);
    postSeekerMap.set(s.job_post_id, arr);
  }

  for (const post of posts) {
    let reason = "";

    if (contact.contact_type === "referral" && contact.company_name && post.company) {
      if (companiesMatch(contact.company_name, post.company)) {
        reason = `Company match: ${post.company}`;
      }
    }

    if (
      contact.contact_type === "recruiter" &&
      contact.industries &&
      contact.industries.length > 0
    ) {
      if (
        industryOverlaps(
          contact.industries,
          [...(post.required_skills || []), ...(post.preferred_skills || [])],
          post.description_text || ""
        )
      ) {
        reason = `Industry: ${contact.industries.join(", ")}`;
      }
    }

    // Also match recruiters by company
    if (!reason && contact.company_name && post.company) {
      if (companiesMatch(contact.company_name, post.company)) {
        reason = `Company match: ${post.company}`;
      }
    }

    if (reason) {
      const seekersForPost = postSeekerMap.get(post.id) || [];
      for (const seekerId of seekersForPost) {
        matchRows.push({
          network_contact_id: contact.id,
          job_post_id: post.id,
          job_seeker_id: seekerId,
          match_reason: reason,
        });
      }
    }
  }

  if (matchRows.length === 0) return;

  // 5. Upsert matches (ignore conflicts)
  const { data: inserted } = await supabaseAdmin
    .from("network_contact_matches")
    .upsert(matchRows, {
      onConflict: "network_contact_id,job_post_id,job_seeker_id",
      ignoreDuplicates: true,
    })
    .select("id");

  // 6. Log activity for each new match
  if (inserted && inserted.length > 0) {
    await supabaseAdmin.from("network_contact_activity").insert({
      network_contact_id: contact.id,
      activity_type: "match_created",
      details: { matches_created: inserted.length },
    });
  }
}

/**
 * When a new job post is scored, check all network contacts for an AM
 * and create matches if applicable.
 */
export async function findMatchesForJobPost(postId: string, amId: string) {
  // 1. Load the job post
  const { data: post, error: pErr } = await supabaseAdmin
    .from("job_posts")
    .select(
      "id, title, company, description_text, required_skills, preferred_skills, industry"
    )
    .eq("id", postId)
    .single();
  if (pErr || !post) return;

  // 2. Get AM's seekers who have a match_score for this post
  const { data: assignments } = await supabaseAdmin
    .from("job_seeker_assignments")
    .select("job_seeker_id")
    .eq("account_manager_id", amId);
  const seekerIds = (assignments ?? []).map((a) => a.job_seeker_id);
  if (seekerIds.length === 0) return;

  const { data: scores } = await supabaseAdmin
    .from("job_match_scores")
    .select("job_seeker_id")
    .eq("job_post_id", postId)
    .in("job_seeker_id", seekerIds);
  const matchedSeekerIds = (scores ?? []).map((s) => s.job_seeker_id);
  if (matchedSeekerIds.length === 0) return;

  // 3. Load AM's network contacts
  const { data: contacts } = await supabaseAdmin
    .from("network_contacts")
    .select("id, contact_type, company_name, industries")
    .eq("account_manager_id", amId)
    .eq("status", "active");
  if (!contacts || contacts.length === 0) return;

  // 4. Find matching contacts for this post
  const matchRows: {
    network_contact_id: string;
    job_post_id: string;
    job_seeker_id: string;
    match_reason: string;
  }[] = [];

  for (const contact of contacts) {
    let reason = "";

    if (contact.contact_type === "referral" && contact.company_name && post.company) {
      if (companiesMatch(contact.company_name, post.company)) {
        reason = `Company match: ${post.company}`;
      }
    }

    if (
      contact.contact_type === "recruiter" &&
      contact.industries &&
      contact.industries.length > 0
    ) {
      if (
        industryOverlaps(
          contact.industries,
          [...(post.required_skills || []), ...(post.preferred_skills || [])],
          post.description_text || ""
        )
      ) {
        reason = `Industry: ${contact.industries.join(", ")}`;
      }
    }

    if (!reason && contact.company_name && post.company) {
      if (companiesMatch(contact.company_name, post.company)) {
        reason = `Company match: ${post.company}`;
      }
    }

    if (reason) {
      for (const seekerId of matchedSeekerIds) {
        matchRows.push({
          network_contact_id: contact.id,
          job_post_id: post.id,
          job_seeker_id: seekerId,
          match_reason: reason,
        });
      }
    }
  }

  if (matchRows.length === 0) return;

  await supabaseAdmin
    .from("network_contact_matches")
    .upsert(matchRows, {
      onConflict: "network_contact_id,job_post_id,job_seeker_id",
      ignoreDuplicates: true,
    });
}
