"use client";

import { useState } from "react";
import Link from "next/link";
import LessonViewer from "./LessonViewer";

type Lesson = {
  id: string;
  title: string;
  content_type: string;
  content: Record<string, unknown>;
  sort_order: number;
  estimated_minutes: number;
  is_ai_generated: boolean;
  progress: {
    status: string;
    completed_at: string | null;
    time_spent_seconds: number;
  } | null;
  is_bookmarked: boolean;
};

type Track = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  job_posts: { title: string; company: string | null } | null;
  learning_lessons: Lesson[];
};

export default function LearningTrackView({ track }: { track: Track }) {
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>(track.learning_lessons);

  const completedCount = lessons.filter(
    (l) => l.progress?.status === "completed"
  ).length;
  const pct =
    lessons.length > 0
      ? Math.round((completedCount / lessons.length) * 100)
      : 0;

  function handleLessonUpdated(updatedLesson: Partial<Lesson> & { id: string }) {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === updatedLesson.id ? { ...l, ...updatedLesson } : l
      )
    );
    if (activeLesson?.id === updatedLesson.id) {
      setActiveLesson((prev) => (prev ? { ...prev, ...updatedLesson } : prev));
    }
  }

  if (activeLesson) {
    return (
      <LessonViewer
        trackId={track.id}
        lesson={activeLesson}
        onBack={() => setActiveLesson(null)}
        onLessonUpdated={handleLessonUpdated}
        totalLessons={lessons.length}
        currentIndex={lessons.findIndex((l) => l.id === activeLesson.id)}
        onNavigate={(index) => setActiveLesson(lessons[index])}
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/portal/learning"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Learning
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-2">
          {track.title}
        </h1>
        {track.description && (
          <p className="text-sm text-gray-500 mt-1">{track.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
            {track.category}
          </span>
          {track.job_posts && (
            <span className="text-xs text-gray-400">
              {track.job_posts.title}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm font-bold text-gray-900">{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {completedCount} of {lessons.length} lessons completed
        </p>
      </div>

      {/* Lesson list */}
      <div className="space-y-2">
        {lessons.map((lesson, index) => {
          const isCompleted = lesson.progress?.status === "completed";
          const isInProgress = lesson.progress?.status === "in_progress";

          return (
            <button
              key={lesson.id}
              onClick={() => setActiveLesson(lesson)}
              className="w-full text-left bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted
                      ? "bg-green-100 text-green-700"
                      : isInProgress
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {lesson.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {lesson.content_type}
                    </span>
                    <span className="text-xs text-gray-400">
                      ~{lesson.estimated_minutes} min
                    </span>
                    {lesson.is_bookmarked && (
                      <span className="text-xs text-yellow-500">Bookmarked</span>
                    )}
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
