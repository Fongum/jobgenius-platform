"use client";

import { useState, useRef, useCallback } from "react";

interface WorkEntry {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  degree: string;
  school: string;
  field: string;
  graduation_year: string;
}

interface ProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  seniority?: string;
  work_type?: string;
  salary_min?: number;
  salary_max?: number;
  target_titles?: string[];
  skills?: string[];
  work_history?: WorkEntry[];
  education?: EducationEntry[];
}

interface DocRecord {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

function Section({
  title,
  children,
  saving,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function ProfileClient({
  profile: initial,
  documents: initialDocs,
}: {
  profile: ProfileData;
  documents: DocRecord[];
}) {
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async (section: string, fields: Partial<ProfileData>) => {
    setSaving(section);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to save." });
        return;
      }
      const { profile: updated } = await res.json();
      setProfile(updated);
      setMessage({ type: "success", text: `${section} saved!` });
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(null);
    }
  }, []);

  const update = (key: keyof ProfileData, value: unknown) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/portal/resume/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Upload failed." });
        return;
      }
      const { document } = await res.json();
      setDocs((d) => [document, ...d]);
      setMessage({ type: "success", text: "Resume uploaded!" });
    } catch {
      setMessage({ type: "error", text: "Upload failed." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !(profile.skills || []).includes(s)) {
      update("skills", [...(profile.skills || []), s]);
    }
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    update("skills", (profile.skills || []).filter((s) => s !== skill));
  };

  const addTargetTitle = () => {
    const t = titleInput.trim();
    if (t && !(profile.target_titles || []).includes(t)) {
      update("target_titles", [...(profile.target_titles || []), t]);
    }
    setTitleInput("");
  };

  const removeTargetTitle = (title: string) => {
    update("target_titles", (profile.target_titles || []).filter((t) => t !== title));
  };

  const addWorkEntry = () => {
    update("work_history", [
      ...(profile.work_history || []),
      { title: "", company: "", start_date: "", end_date: "", current: false, description: "" },
    ]);
  };

  const updateWorkEntry = (index: number, field: keyof WorkEntry, value: unknown) => {
    const entries = [...(profile.work_history || [])];
    entries[index] = { ...entries[index], [field]: value };
    update("work_history", entries);
  };

  const removeWorkEntry = (index: number) => {
    update("work_history", (profile.work_history || []).filter((_, i) => i !== index));
  };

  const addEducationEntry = () => {
    update("education", [
      ...(profile.education || []),
      { degree: "", school: "", field: "", graduation_year: "" },
    ]);
  };

  const updateEducationEntry = (index: number, field: keyof EducationEntry, value: string) => {
    const entries = [...(profile.education || [])];
    entries[index] = { ...entries[index], [field]: value };
    update("education", entries);
  };

  const removeEducationEntry = (index: number) => {
    update("education", (profile.education || []).filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Your Profile</h2>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Personal Info */}
      <Section
        title="Personal Information"
        saving={saving === "Personal Information"}
        onSave={() =>
          save("Personal Information", {
            full_name: profile.full_name,
            phone: profile.phone,
            location: profile.location,
            linkedin_url: profile.linkedin_url,
            portfolio_url: profile.portfolio_url,
            address_line1: profile.address_line1,
            address_city: profile.address_city,
            address_state: profile.address_state,
            address_zip: profile.address_zip,
            address_country: profile.address_country,
          })
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={profile.full_name || ""}
              onChange={(e) => update("full_name", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={profile.email || ""}
              disabled
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={profile.phone || ""}
              onChange={(e) => update("phone", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={profile.location || ""}
              onChange={(e) => update("location", e.target.value)}
              placeholder="City, State"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
            <input
              type="url"
              value={profile.linkedin_url || ""}
              onChange={(e) => update("linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio URL</label>
            <input
              type="url"
              value={profile.portfolio_url || ""}
              onChange={(e) => update("portfolio_url", e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Mailing Address</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <input
                type="text"
                value={profile.address_line1 || ""}
                onChange={(e) => update("address_line1", e.target.value)}
                placeholder="Street address"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <input
              type="text"
              value={profile.address_city || ""}
              onChange={(e) => update("address_city", e.target.value)}
              placeholder="City"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={profile.address_state || ""}
              onChange={(e) => update("address_state", e.target.value)}
              placeholder="State"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={profile.address_zip || ""}
              onChange={(e) => update("address_zip", e.target.value)}
              placeholder="ZIP code"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              value={profile.address_country || ""}
              onChange={(e) => update("address_country", e.target.value)}
              placeholder="Country"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </Section>

      {/* Work Preferences */}
      <Section
        title="Work Preferences"
        saving={saving === "Work Preferences"}
        onSave={() =>
          save("Work Preferences", {
            seniority: profile.seniority,
            work_type: profile.work_type,
            salary_min: profile.salary_min,
            salary_max: profile.salary_max,
            target_titles: profile.target_titles,
          })
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seniority</label>
            <select
              value={profile.seniority || ""}
              onChange={(e) => update("seniority", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select...</option>
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
              <option value="manager">Manager</option>
              <option value="director">Director</option>
              <option value="vp">VP</option>
              <option value="c-level">C-Level</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
            <select
              value={profile.work_type || ""}
              onChange={(e) => update("work_type", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select...</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Salary</label>
            <input
              type="number"
              value={profile.salary_min || ""}
              onChange={(e) => update("salary_min", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 80000"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Salary</label>
            <input
              type="number"
              value={profile.salary_max || ""}
              onChange={(e) => update("salary_max", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g. 120000"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Target Titles</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTargetTitle())}
              placeholder="Add a target title..."
              className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={addTargetTitle}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {(profile.target_titles || []).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {t}
                <button onClick={() => removeTargetTitle(t)} className="hover:text-blue-600">
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* Skills */}
      <Section
        title="Skills"
        saving={saving === "Skills"}
        onSave={() => save("Skills", { skills: profile.skills })}
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
            placeholder="Add a skill..."
            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={addSkill}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(profile.skills || []).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
            >
              {s}
              <button onClick={() => removeSkill(s)} className="hover:text-green-600">
                &times;
              </button>
            </span>
          ))}
        </div>
      </Section>

      {/* Work History */}
      <Section
        title="Work History"
        saving={saving === "Work History"}
        onSave={() => save("Work History", { work_history: profile.work_history })}
      >
        {(profile.work_history || []).map((entry, i) => (
          <div key={i} className="border rounded-lg p-4 mb-4">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-gray-500">Position {i + 1}</span>
              <button
                onClick={() => removeWorkEntry(i)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={entry.title}
                onChange={(e) => updateWorkEntry(i, "title", e.target.value)}
                placeholder="Job Title"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={entry.company}
                onChange={(e) => updateWorkEntry(i, "company", e.target.value)}
                placeholder="Company"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={entry.start_date}
                onChange={(e) => updateWorkEntry(i, "start_date", e.target.value)}
                placeholder="Start (YYYY-MM)"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={entry.end_date}
                  onChange={(e) => updateWorkEntry(i, "end_date", e.target.value)}
                  placeholder="End (YYYY-MM)"
                  disabled={entry.current}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                />
                <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={entry.current}
                    onChange={(e) => updateWorkEntry(i, "current", e.target.checked)}
                    className="rounded"
                  />
                  Current
                </label>
              </div>
              <div className="sm:col-span-2">
                <textarea
                  value={entry.description}
                  onChange={(e) => updateWorkEntry(i, "description", e.target.value)}
                  placeholder="Description of responsibilities and achievements..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={addWorkEntry}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Position
        </button>
      </Section>

      {/* Education */}
      <Section
        title="Education"
        saving={saving === "Education"}
        onSave={() => save("Education", { education: profile.education })}
      >
        {(profile.education || []).map((entry, i) => (
          <div key={i} className="border rounded-lg p-4 mb-4">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-gray-500">Education {i + 1}</span>
              <button
                onClick={() => removeEducationEntry(i)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={entry.degree}
                onChange={(e) => updateEducationEntry(i, "degree", e.target.value)}
                placeholder="Degree (e.g. BS, MS, MBA)"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={entry.school}
                onChange={(e) => updateEducationEntry(i, "school", e.target.value)}
                placeholder="School"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={entry.field}
                onChange={(e) => updateEducationEntry(i, "field", e.target.value)}
                placeholder="Field of Study"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={entry.graduation_year}
                onChange={(e) => updateEducationEntry(i, "graduation_year", e.target.value)}
                placeholder="Graduation Year"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        ))}
        <button
          onClick={addEducationEntry}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Education
        </button>
      </Section>

      {/* Resume Upload */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume</h3>
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleUpload}
            className="hidden"
          />
          {uploading ? (
            <p className="text-gray-500">Uploading...</p>
          ) : (
            <>
              <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium">Click to upload or drag and drop</p>
              <p className="text-sm text-gray-400 mt-1">PDF, DOCX, DOC, or TXT (max 5MB)</p>
            </>
          )}
        </div>

        {docs.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Uploaded Resumes</h4>
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
