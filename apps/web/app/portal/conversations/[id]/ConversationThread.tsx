"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type Message = {
  id: string;
  sender_type: string;
  sender_id: string;
  content: string;
  is_answer: boolean;
  created_at: string;
  read_at: string | null;
};

type Conversation = {
  id: string;
  conversation_type: "general" | "application_question";
  subject: string;
  status: string;
  account_managers: { name: string; email: string } | null;
  job_posts: { title: string; company: string | null } | null;
};

export default function ConversationThread({
  conversation,
  initialMessages,
  userId,
}: {
  conversation: Conversation;
  initialMessages: Message[];
  userId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [saveAsAnswer, setSaveAsAnswer] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/portal/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newMessage.trim(),
            is_answer:
              saveAsAnswer &&
              conversation.conversation_type === "application_question",
          }),
        }
      );

      if (res.ok) {
        const { message } = await res.json();
        setMessages((prev) => [...prev, message]);
        setNewMessage("");
        setSaveAsAnswer(false);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleMarkAsAnswer(messageId: string) {
    // Save existing message as an answer to application_question_answers
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    const res = await fetch(
      `/api/portal/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message.content,
          is_answer: true,
        }),
      }
    );

    if (res.ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_answer: true } : m))
      );
    }
  }

  const isApplicationQuestion =
    conversation.conversation_type === "application_question";

  return (
    <div className="flex flex-col h-[calc(100vh-220px)]">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/portal/conversations"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              &larr; Back to conversations
            </Link>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">
              {conversation.subject}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  isApplicationQuestion
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {isApplicationQuestion ? "Application Question" : "General"}
              </span>
              {conversation.job_posts && (
                <span className="text-xs text-gray-500">
                  {conversation.job_posts.title}
                  {conversation.job_posts.company
                    ? ` at ${conversation.job_posts.company}`
                    : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              With: {conversation.account_managers?.name || "Account Manager"}
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                conversation.status === "open"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {conversation.status}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No messages yet in this conversation.
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === "job_seeker";
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-3 ${
                    isMe
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isMe ? "text-blue-100" : "text-gray-500"
                      }`}
                    >
                      {isMe
                        ? "You"
                        : conversation.account_managers?.name || "AM"}
                    </span>
                    <span
                      className={`text-xs ${
                        isMe ? "text-blue-200" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.is_answer && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                      Saved as profile answer
                    </span>
                  )}
                  {isMe &&
                    isApplicationQuestion &&
                    !msg.is_answer &&
                    msg.sender_id === userId && (
                      <button
                        onClick={() => handleMarkAsAnswer(msg.id)}
                        className="mt-2 text-xs underline text-blue-200 hover:text-white"
                      >
                        Save as reusable answer
                      </button>
                    )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {conversation.status === "open" && (
        <form
          onSubmit={handleSend}
          className="mt-4 bg-white rounded-lg shadow p-4"
        >
          {isApplicationQuestion && (
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <input
                type="checkbox"
                checked={saveAsAnswer}
                onChange={(e) => setSaveAsAnswer(e.target.checked)}
                className="rounded border-gray-300"
              />
              Save this response as a reusable answer on my profile
            </label>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
