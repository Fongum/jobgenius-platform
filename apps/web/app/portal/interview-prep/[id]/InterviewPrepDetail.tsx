"use client";

import { useState } from "react";
import Link from "next/link";

type PrepContent = {
  role_summary?: string;
  company_notes?: string[];
  likely_questions?: string[];
  answer_structure?: string[];
  technical_topics?: string[];
  behavioral_topics?: string[];
  checklist?: string[];
  thirty_sixty_ninety?: string[];
};

type Prep = {
  id: string;
  content: PrepContent;
  job_posts: { title: string; company: string | null } | null;
  updated_at: string;
};

type Video = {
  id: string;
  title: string;
  url: string;
  source: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  description: string | null;
  category: string | null;
};

type PracticeQuestion = {
  question: string;
  expected_hint: string;
  user_answer: string;
  score: number | null;
  feedback: string | null;
  star_score?: number | null;
  relevance_score?: number | null;
  specificity_score?: number | null;
  confidence_coaching?: string | null;
  rewrite_suggestions?: string[] | null;
};

type Session = {
  id: string;
  session_type: string;
  status: string;
  questions: PracticeQuestion[];
  overall_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const SUB_TABS = [
  { key: "notes", label: "Study Notes" },
  { key: "videos", label: "Videos" },
  { key: "practice", label: "Practice Q&A" },
  { key: "simulation", label: "Audio Simulation" },
] as const;

export default function InterviewPrepDetail({
  prep,
  videos,
  sessions: initialSessions,
}: {
  prep: Prep;
  videos: Video[];
  sessions: Session[];
}) {
  const [activeTab, setActiveTab] = useState<string>("notes");
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const content = prep.content ?? {};
  const jobPost = prep.job_posts;

  async function startNewPractice() {
    setCreating(true);
    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prep.id}/practice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_type: "qa" }),
        }
      );
      if (res.ok) {
        const { session } = await res.json();
        setSessions((prev) => [session, ...prev]);
        setActiveSession(session);
        setCurrentQ(0);
        setUserAnswer("");

        // Mark as in_progress
        await fetch(
          `/api/portal/interview-prep/${prep.id}/practice/${session.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "in_progress" }),
          }
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function submitAnswer() {
    if (!activeSession || !userAnswer.trim()) return;
    setSubmitting(true);

    const updatedQuestions = [...activeSession.questions];
    updatedQuestions[currentQ] = {
      ...updatedQuestions[currentQ],
      user_answer: userAnswer.trim(),
    };

    const isLast = currentQ === activeSession.questions.length - 1;

    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prep.id}/practice/${activeSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: updatedQuestions,
            status: isLast ? "completed" : "in_progress",
          }),
        }
      );

      if (res.ok) {
        const { session: updated } = await res.json();
        setActiveSession(updated);
        setSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );

        if (!isLast) {
          setCurrentQ(currentQ + 1);
          setUserAnswer("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resumeSession(session: Session) {
    setActiveSession(session);
    const firstUnanswered = session.questions.findIndex(
      (q) => !q.user_answer
    );
    setCurrentQ(firstUnanswered >= 0 ? firstUnanswered : 0);
    setUserAnswer("");
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/portal/interview-prep"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Interview Prep
        </Link>
        <h2 className="text-xl font-semibold text-gray-900 mt-1">
          {jobPost?.title || "Interview Preparation"}
        </h2>
        {jobPost?.company && (
          <p className="text-sm text-gray-500">{jobPost.company}</p>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setActiveSession(null);
            }}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Study Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            Study notes generated from the job description and your resume.
            Review these before your interview.
          </div>

          {content.role_summary && (
            <Section title="Role Summary">
              <p className="text-sm text-gray-700">{content.role_summary}</p>
            </Section>
          )}

          {content.company_notes && content.company_notes.length > 0 && (
            <Section title="Company Research">
              <ul className="list-disc list-inside space-y-1">
                {content.company_notes.map((note, i) => (
                  <li key={i} className="text-sm text-gray-700">{note}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.likely_questions && content.likely_questions.length > 0 && (
            <Section title="Likely Questions">
              <ol className="list-decimal list-inside space-y-2">
                {content.likely_questions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700">{q}</li>
                ))}
              </ol>
            </Section>
          )}

          {content.answer_structure && content.answer_structure.length > 0 && (
            <Section title="Answer Structure (STAR Method)">
              <ol className="list-decimal list-inside space-y-1">
                {content.answer_structure.map((step, i) => (
                  <li key={i} className="text-sm text-gray-700">{step}</li>
                ))}
              </ol>
            </Section>
          )}

          {content.technical_topics && content.technical_topics.length > 0 && (
            <Section title="Technical Topics">
              <ul className="list-disc list-inside space-y-1">
                {content.technical_topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-700">{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.behavioral_topics && content.behavioral_topics.length > 0 && (
            <Section title="Behavioral Topics">
              <ul className="list-disc list-inside space-y-1">
                {content.behavioral_topics.map((topic, i) => (
                  <li key={i} className="text-sm text-gray-700">{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {content.checklist && content.checklist.length > 0 && (
            <Section title="Prep Checklist">
              <ul className="space-y-2">
                {content.checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="mt-0.5 rounded border-gray-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {content.thirty_sixty_ninety && content.thirty_sixty_ninety.length > 0 && (
            <Section title="30/60/90 Day Plan">
              <ul className="list-disc list-inside space-y-1">
                {content.thirty_sixty_ninety.map((item, i) => (
                  <li key={i} className="text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === "videos" && (
        <div>
          {videos.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-4xl mb-4">🎥</div>
              <p className="text-gray-500">No videos added yet.</p>
              <p className="text-sm text-gray-400 mt-2">
                Your account manager will add recommended preparation videos
                here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                  {video.thumbnail_url && (
                    <div className="w-full h-40 bg-gray-200 rounded-md mb-3 overflow-hidden">
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <h4 className="text-sm font-semibold text-gray-900">
                    {video.title}
                  </h4>
                  {video.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {video.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    {video.category && (
                      <span className="px-2 py-0.5 bg-gray-100 rounded">
                        {video.category}
                      </span>
                    )}
                    {video.duration_seconds && (
                      <span>
                        {Math.floor(video.duration_seconds / 60)} min
                      </span>
                    )}
                    {video.source && <span>{video.source}</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Practice Q&A Tab */}
      {activeTab === "practice" && (
        <div>
          {activeSession ? (
            <PracticeSessionView
              session={activeSession}
              currentQ={currentQ}
              userAnswer={userAnswer}
              submitting={submitting}
              onAnswerChange={setUserAnswer}
              onSubmit={submitAnswer}
              onBack={() => setActiveSession(null)}
              prepId={prep.id}
            />
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Practice Sessions
                </h3>
                <button
                  onClick={startNewPractice}
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? "Creating..." : "Start New Practice"}
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <p className="text-gray-500">No practice sessions yet.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Start a practice session to test your interview readiness.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions
                    .filter((s) => s.session_type === "qa")
                    .map((session) => (
                      <div
                        key={session.id}
                        className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                session.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : session.status === "in_progress"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {session.status.replace("_", " ")}
                            </span>
                            {session.overall_score !== null && (
                              <span className="text-sm font-bold text-gray-900">
                                Score: {session.overall_score}%
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {session.questions.length} questions
                            {" - "}
                            {new Date(session.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            session.status === "completed"
                              ? resumeSession(session)
                              : resumeSession(session)
                          }
                          className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100"
                        >
                          {session.status === "completed"
                            ? "Review"
                            : "Continue"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audio Simulation Tab */}
      {activeTab === "simulation" && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-6xl mb-4">🎙️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Audio Interview Simulation
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Audio interview simulation is coming soon. In the meantime, practice
            answering questions aloud using the Practice Q&A tab.
          </p>
          <button
            onClick={() => setActiveTab("practice")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Practice Q&A
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score?: number | null }) {
  if (score === null || score === undefined) return null;
  const tone =
    score >= 80
      ? "bg-green-50 text-green-700"
      : score >= 60
      ? "bg-yellow-50 text-yellow-700"
      : "bg-red-50 text-red-700";
  return (
    <div className={`rounded-lg px-3 py-2 ${tone}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-lg font-semibold">{score}</div>
    </div>
  );
}

function PracticeSessionView({
  session,
  currentQ,
  userAnswer,
  submitting,
  onAnswerChange,
  onSubmit,
  onBack,
}: {
  session: Session;
  currentQ: number;
  userAnswer: string;
  submitting: boolean;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  prepId: string;
}) {
  const question = session.questions[currentQ];
  const isCompleted = session.status === "completed";
  const answeredCount = session.questions.filter(
    (q) => q.user_answer
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to sessions
        </button>
        <span className="text-sm text-gray-500">
          Question {currentQ + 1} of {session.questions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{
            width: `${(answeredCount / session.questions.length) * 100}%`,
          }}
        />
      </div>

      {isCompleted && session.overall_score !== null && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-center">
          <p className="text-lg font-bold text-green-700">
            Overall Score: {session.overall_score}%
          </p>
          <p className="text-sm text-green-600 mt-1">
            Practice session complete! Review your answers below.
          </p>
        </div>
      )}

      {/* Question */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {question?.question}
        </h3>

        {question?.user_answer ? (
          <div>
            <div className="bg-gray-50 rounded-lg p-4 mb-3">
              <p className="text-sm font-medium text-gray-500 mb-1">
                Your Answer:
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {question.user_answer}
              </p>
            </div>
            {question.score !== null && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <ScorePill label="Overall" score={question.score} />
                <ScorePill label="STAR" score={question.star_score} />
                <ScorePill label="Relevance" score={question.relevance_score} />
                <ScorePill label="Specificity" score={question.specificity_score} />
              </div>
            )}
            {question.feedback && (
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-semibold">Coach feedback:</span>{" "}
                {question.feedback}
              </p>
            )}
            {question.confidence_coaching && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-blue-700">
                  <span className="font-semibold">Confidence coaching:</span>{" "}
                  {question.confidence_coaching}
                </p>
              </div>
            )}
            {question.rewrite_suggestions &&
              question.rewrite_suggestions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">
                    Rewrite suggestions
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {question.rewrite_suggestions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        ) : (
          <div>
            <textarea
              value={userAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              rows={6}
              placeholder="Type your answer here... Use the STAR method (Situation, Task, Action, Result) for behavioral questions."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={onSubmit}
                disabled={submitting || !userAnswer.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting
                  ? "Submitting..."
                  : currentQ === session.questions.length - 1
                  ? "Submit & Finish"
                  : "Submit & Next"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Question navigation */}
      <div className="flex justify-center gap-2 mt-6">
        {session.questions.map((q, i) => (
          <button
            key={i}
            onClick={() => {
              onAnswerChange(q.user_answer || "");
              // We need to update currentQ through parent
              // For now, we can't navigate freely - just show indicators
            }}
            className={`w-8 h-8 rounded-full text-xs font-medium ${
              i === currentQ
                ? "bg-blue-600 text-white"
                : q.user_answer
                ? q.score !== null && q.score >= 70
                  ? "bg-green-100 text-green-700"
                  : q.score !== null
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-200 text-gray-600"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
