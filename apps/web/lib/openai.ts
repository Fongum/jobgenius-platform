import OpenAI from "openai";

let client: OpenAI | null = null;

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
