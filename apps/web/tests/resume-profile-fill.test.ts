import { describe, it, expect } from "vitest";
import { buildProfileFill, cleanSkills } from "@/lib/resume-profile-fill";

const parsed = {
  full_name: "Sam Doe",
  email: "sam@example.com",
  phone: "+1 555 010 0100",
  location: "Austin, TX",
  linkedin_url: "https://www.linkedin.com/in/samdoe",
  skills: ["Postgres", "TypeScript", "postgres", "  ", "Go"],
  work_history: [
    { title: "Backend Engineer", company: "Initech", start_date: "2021", end_date: "2024", current: false, description: "Built APIs." },
    { title: "", company: "", description: "noise" },
  ],
  education: [{ degree: "BSc", school: "State University", field: "CS", graduation_year: 2020 }],
};

const emptySeeker = { full_name: "Sam", phone: null, location: "", linkedin_url: undefined, skills: [], work_history: [], education: [] };

describe("buildProfileFill", () => {
  it("fills every empty column from a parsed résumé", () => {
    const { updates, filled } = buildProfileFill(emptySeeker, parsed);
    expect(filled.sort()).toEqual(["education", "linkedin_url", "location", "phone", "skills", "work_history"]);
    expect(updates.phone).toBe("+1 555 010 0100");
    expect(updates.location).toBe("Austin, TX");
  });

  it("never overwrites a value the seeker or an AM already set", () => {
    const seeker = {
      ...emptySeeker,
      phone: "999",
      skills: ["Rust"],
      work_history: [{ title: "Existing", company: "Co" }],
    };
    const { updates, filled } = buildProfileFill(seeker, parsed);
    expect(updates).not.toHaveProperty("phone");
    expect(updates).not.toHaveProperty("skills");
    expect(updates).not.toHaveProperty("work_history");
    expect(filled.sort()).toEqual(["education", "linkedin_url", "location"]);
  });

  it("treats whitespace-only strings and empty arrays as empty", () => {
    const { filled } = buildProfileFill({ phone: "   ", skills: [] }, parsed);
    expect(filled).toContain("phone");
    expect(filled).toContain("skills");
  });

  it("never touches identity fields", () => {
    const { updates } = buildProfileFill(emptySeeker, parsed);
    expect(updates).not.toHaveProperty("full_name");
    expect(updates).not.toHaveProperty("email");
  });

  it("de-duplicates skills case-insensitively and drops blanks", () => {
    const { updates } = buildProfileFill(emptySeeker, parsed);
    expect(updates.skills).toEqual(["Postgres", "TypeScript", "Go"]);
  });

  it("drops noise work-history entries and normalises the shape", () => {
    const { updates } = buildProfileFill(emptySeeker, parsed);
    expect(updates.work_history).toEqual([
      { title: "Backend Engineer", company: "Initech", start_date: "2021", end_date: "2024", current: false, description: "Built APIs." },
    ]);
  });

  it("coerces a numeric graduation year to a string", () => {
    const { updates } = buildProfileFill(emptySeeker, parsed);
    expect(updates.education).toEqual([{ degree: "BSc", school: "State University", field: "CS", graduation_year: "2020" }]);
  });

  it("rejects a LinkedIn value that is not a profile URL", () => {
    const { filled } = buildProfileFill(emptySeeker, { linkedin_url: "https://evil.example/x" });
    expect(filled).not.toContain("linkedin_url");
  });

  it("treats AI output as untrusted: wrong types produce no updates and no throw", () => {
    const garbage = { phone: 42, skills: "postgres", work_history: { a: 1 }, education: [null, 5, "x"], location: {} };
    expect(buildProfileFill(emptySeeker, garbage as never)).toEqual({ updates: {}, filled: [] });
  });

  it("caps list sizes and field lengths", () => {
    const many = Array.from({ length: 200 }, (_, i) => `skill-${i}`);
    const jobs = Array.from({ length: 40 }, (_, i) => ({ title: `T${i}`, company: "C", description: "d".repeat(5000) }));
    const { updates } = buildProfileFill(emptySeeker, { skills: many, work_history: jobs });
    expect(updates.skills as string[]).toHaveLength(50);
    expect(updates.work_history as unknown[]).toHaveLength(15);
    expect(((updates.work_history as Array<{ description: string }>)[0]).description.length).toBe(1500);
  });

  it("handles null / undefined parsed input", () => {
    expect(buildProfileFill(emptySeeker, null)).toEqual({ updates: {}, filled: [] });
    expect(buildProfileFill(emptySeeker, undefined)).toEqual({ updates: {}, filled: [] });
  });
});

describe("cleanSkills", () => {
  it("returns [] for non-arrays", () => {
    expect(cleanSkills(undefined)).toEqual([]);
    expect(cleanSkills("a, b")).toEqual([]);
  });
});
