"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Turn = {
  id: string;
  turn_number: number;
  speaker: string;
  content: string;
  score: number | null;
  feedback: string | null;
};

type VoiceSession = {
  id: string;
  interviewer_persona: string;
  status: string;
  total_turns: number;
  overall_score: number | null;
  overall_feedback: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type RecordingState = "idle" | "recording" | "processing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionConstructor = new () => any;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

const PERSONAS = [
  { value: "professional", label: "Professional (HR)" },
  { value: "technical", label: "Technical (Engineer)" },
  { value: "behavioral", label: "Behavioral (Hiring Manager)" },
  { value: "stress", label: "Stress (Challenging)" },
];

export default function VoiceSimulatorTab({ prepId }: { prepId: string }) {
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [activeSession, setActiveSession] = useState<VoiceSession | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [persona, setPersona] = useState("professional");
  const [creating, setCreating] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = !!SpeechRecognitionClass;

  // Load sessions list
  if (!loaded) {
    setLoaded(true);
    // We'll load sessions from the voice-session endpoint
    // For now, there's no list endpoint, so we start fresh
  }

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopRecording();
  }, [stopRecording]);

  // Scroll to bottom when turns change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // TTS for interviewer turns
  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function startSession() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prepId}/voice-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        }
      );
      if (res.ok) {
        const { session, turn } = await res.json();
        setActiveSession(session);
        setTurns([turn]);
        speak(turn.content);
      }
    } catch {
      setError("Failed to start session.");
    } finally {
      setCreating(false);
    }
  }

  function startRecording() {
    if (!SpeechRecognitionClass) return;

    setTranscript("");
    setInterimText("");
    setError(null);
    setRecordingState("recording");

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + " ";
          setTranscript(finalText.trim());
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        setError(`Speech recognition error: ${event.error}`);
        setRecordingState("idle");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  async function handleStopAndSubmit(overrideText?: string) {
    stopRecording();
    const finalAnswer = (overrideText || transcript).trim();

    if (!finalAnswer || !activeSession) {
      setRecordingState("idle");
      if (!finalAnswer) setError("No speech detected. Please try again.");
      return;
    }

    setRecordingState("processing");
    setTranscript(finalAnswer);
    setInterimText("");

    try {
      const res = await fetch(
        `/api/portal/interview-prep/${prepId}/voice-session/${activeSession.id}/turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: finalAnswer }),
        }
      );

      if (res.ok) {
        const data = await res.json();

        // Add candidate turn
        setTurns((prev) => [
          ...prev,
          {
            ...data.candidate_turn,
            score: data.score,
            feedback: data.feedback,
          },
          data.interviewer_turn,
        ]);

        speak(data.interviewer_turn.content);

        // If final, complete the session
        if (data.is_final) {
          const completeRes = await fetch(
            `/api/portal/interview-prep/${prepId}/voice-session/${activeSession.id}`,
            { method: "PATCH" }
          );
          if (completeRes.ok) {
            const { session: completed } = await completeRes.json();
            setActiveSession(completed);
          }
        } else {
          setActiveSession((prev) =>
            prev ? { ...prev, total_turns: (prev.total_turns ?? 0) + 2 } : prev
          );
        }

        setTranscript("");
      } else {
        setError("Failed to submit your answer.");
      }
    } catch {
      setError("Failed to submit your answer.");
    } finally {
      setRecordingState("idle");
    }
  }

  async function endSession() {
    if (!activeSession) return;
    const res = await fetch(
      `/api/portal/interview-prep/${prepId}/voice-session/${activeSession.id}`,
      { method: "PATCH" }
    );
    if (res.ok) {
      const { session: completed } = await res.json();
      setActiveSession(completed);
    }
  }

  // Active session view
  if (activeSession) {
    const isCompleted = activeSession.status === "completed";

    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={() => {
              setActiveSession(null);
              setTurns([]);
              window.speechSynthesis?.cancel();
            }}
            className="text-sm text-blue-600 hover:text-blue-800 flex-shrink-0"
          >
            &larr; Back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded whitespace-nowrap">
              {PERSONAS.find((p) => p.value === activeSession.interviewer_persona)?.label}
            </span>
            {!isCompleted && (
              <button
                onClick={endSession}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 whitespace-nowrap"
              >
                End Interview
              </button>
            )}
          </div>
        </div>

        {/* Completed banner */}
        {isCompleted && activeSession.overall_score !== null && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-center">
            <p className="text-lg font-bold text-green-700">
              Session Score: {activeSession.overall_score}%
            </p>
            {activeSession.overall_feedback && (
              <p className="text-sm text-green-600 mt-1">
                {activeSession.overall_feedback}
              </p>
            )}
          </div>
        )}

        {/* Chat-style conversation */}
        <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-4 max-h-[60vh] sm:max-h-96 overflow-y-auto">
          <div className="space-y-3 sm:space-y-4">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${
                  turn.speaker === "candidate" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 ${
                    turn.speaker === "candidate"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm">{turn.content}</p>
                  {turn.speaker === "candidate" &&
                    turn.score !== null && (
                      <div className="mt-2 pt-2 border-t border-blue-500">
                        <span className="text-xs text-blue-200">
                          Score: {turn.score}%
                        </span>
                        {turn.feedback && (
                          <p className="text-xs text-blue-200 mt-0.5">
                            {turn.feedback}
                          </p>
                        )}
                      </div>
                    )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Recording controls */}
        {!isCompleted && isSupported && (
          <div className="bg-white rounded-lg shadow p-4">
            {recordingState === "recording" && (
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-500 rounded-full animate-pulse"
                      style={{
                        height: `${12 + Math.random() * 20}px`,
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm text-red-600 font-medium">
                  Recording...
                </span>
              </div>
            )}

            {(transcript || interimText) && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <p className="text-sm text-gray-700">
                  {transcript}
                  {interimText && (
                    <span className="text-gray-400"> {interimText}</span>
                  )}
                </p>
              </div>
            )}

            <div className="flex justify-center gap-3">
              {recordingState === "idle" && (
                <button
                  onClick={startRecording}
                  className="px-6 py-4 sm:py-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <span className="w-3 h-3 bg-white rounded-full" />
                  Record Answer
                </button>
              )}
              {recordingState === "recording" && (
                <button
                  onClick={() => handleStopAndSubmit()}
                  className="px-6 py-4 sm:py-3 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 w-full sm:w-auto"
                >
                  Stop & Send
                </button>
              )}
              {recordingState === "processing" && (
                <div className="px-6 py-4 sm:py-3 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg w-full sm:w-auto text-center">
                  Processing...
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center mt-3">{error}</p>
            )}
          </div>
        )}

        {!isSupported && !isCompleted && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <p className="text-sm text-yellow-800">
              Speech recognition is not supported in this browser. Use Chrome or Edge.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Session start view
  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Voice Interview Simulator
      </h3>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-center">
        <p className="text-gray-600 mb-4 text-sm sm:text-base">
          Practice with an AI interviewer. Select a persona and start.
          The interviewer will ask questions and you respond by speaking.
        </p>

        <div className="grid grid-cols-2 sm:flex sm:justify-center gap-2 mb-6">
          {PERSONAS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPersona(p.value)}
              className={`px-3 py-2.5 sm:py-2 text-sm rounded-lg border-2 transition-colors ${
                persona === p.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={startSession}
          disabled={creating || !isSupported}
          className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors w-full sm:w-auto"
        >
          {creating ? "Starting..." : "Start Interview"}
        </button>

        {!isSupported && (
          <p className="text-sm text-yellow-600 mt-3">
            Speech recognition requires Chrome or Edge browser.
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center mt-3">{error}</p>
      )}
    </div>
  );
}
