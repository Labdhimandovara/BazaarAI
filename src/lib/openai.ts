import OpenAI from "openai";

const provider = process.env.AI_PROVIDER || "openai";
let apiKey = "dummy-key";
let baseURL: string | undefined = undefined;

if (provider === "gemini") {
  apiKey = process.env.GEMINI_API_KEY || "dummy-key";
  baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
} else {
  apiKey = process.env.OPENAI_API_KEY || "dummy-key";
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
  // Add fallback custom headers if necessary for Gemini
});
