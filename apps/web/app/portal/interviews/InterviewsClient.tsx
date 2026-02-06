"use client";

import { useState } from "react";

interface Interview {
  id: string;
  company_name: string;
  role_title: string;
  interview_type?: string;
  scheduled_at: string;
  status: string;
  join_url?: string;
  notes?: string;
}

interface PrepItem {
  id: string;
  interview_id: string;
  section_title?: string;
  content?: string;
}

export default function InterviewsClient({
  initialInterviews,
  initialPrep,
}: {
  initialInterviews: Interview[];
  initialPrep: Record<string, unknown>[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const now = new Date();
  const upcoming = initialInterviews.filter(
    (i) => new Date(i.scheduled_at) >= now && i.status === "SCHEDULED"
  );
  const past = initialInterviews.filter(
    (i) => new Date(i.scheduled_at) < now || i.status !== "SCHEDULED"
  );

  const prepByInterview = (initialPrep as unknown as PrepItem[]).reduce(
    (acc, p) => {
      if (!acc[p.interview_id]) acc[p.interview_id] = [];
      acc[p.interview_id].push(p);
      return acc;
    },
    {} as Record<string, PrepItem[]>
  );

  const InterviewCard = ({ interview }: { interview: Interview }) => {
    const isExpanded = expandedId === interview.id;
    const prep = prepByInterview[interview.id] || [];
    const dateObj = new Date(interview.scheduled_at);

    return (
      <div className="bg-white rounded-lg shadow">
        <div
          className="p-5 cursor-pointer"
          onClick={() => setExpandedId(isExpanded ? null : interview.id)}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{interview.company_name}</h3>
              <p className="text-sm text-gray-600">{interview.role_title}</p>
              {interview.interview_type && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 capitalize">
                  {interview.interview_type}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {dateObj.toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">
                {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            {interview.join_url && (
              <a
                href={interview.join_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Join Meeting
              </a>
            )}
            {prep.length > 0 && (
              <span className="text-sm text-gray-500">
                {prep.length} prep section{prep.length !== 1 ? "s" : ""}
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-5 py-4 space-y-4">
            {interview.notes && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                <p className="text-sm text-gray-600">{interview.notes}</p>
              </div>
            )}
            {prep.length > 0 ? (
              prep.map((p) => (
                <div key={p.id}>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">
                    {p.section_title || "Prep Material"}
                  </h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {p.content || "No content yet."}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                No preparation materials available yet.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Interviews</h2>

      {initialInterviews.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No interviews scheduled yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Interviews will appear here as you progress through applications.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Upcoming</h3>
              <div className="space-y-3">
                {upcoming.map((i) => (
                  <InterviewCard key={i.id} interview={i} />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Past</h3>
              <div className="space-y-3">
                {past.map((i) => (
                  <InterviewCard key={i.id} interview={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
