export type ContactType = "recruiter" | "referral";
export type ContactSource = "manual" | "extension" | "import";
export type ContactStatus = "active" | "inactive" | "do_not_contact";
export type MatchStatus = "pending" | "contacted" | "responded" | "dismissed";
export type ActivityType =
  | "email_sent"
  | "text_copied"
  | "note_added"
  | "status_changed"
  | "match_created";

export interface NetworkContact {
  id: string;
  account_manager_id: string;
  contact_type: ContactType;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  job_title: string | null;
  industries: string[];
  notes: string | null;
  source: ContactSource;
  status: ContactStatus;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NetworkContactMatch {
  id: string;
  network_contact_id: string;
  job_post_id: string;
  job_seeker_id: string;
  match_reason: string;
  status: MatchStatus;
  created_at: string;
}

export interface NetworkContactActivity {
  id: string;
  network_contact_id: string;
  activity_type: ActivityType;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CreateNetworkContactInput {
  contact_type: ContactType;
  full_name: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  company_name?: string;
  company_domain?: string;
  job_title?: string;
  industries?: string[];
  notes?: string;
  source?: ContactSource;
}

export interface UpdateNetworkContactInput {
  full_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  company_name?: string;
  company_domain?: string;
  job_title?: string;
  industries?: string[];
  notes?: string;
  status?: ContactStatus;
  contact_type?: ContactType;
}

/** NetworkContactMatch joined with related entities for display */
export interface NetworkContactMatchWithDetails extends NetworkContactMatch {
  network_contact?: NetworkContact;
  job_post?: {
    id: string;
    job_title: string | null;
    company_name: string | null;
    url: string | null;
  };
  job_seeker?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}
