import { createOpenAI } from "@ai-sdk/openai";

/**
 * Central model configuration for the Vector AI agent (Track D).
 *
 * Chat and embeddings talk to two *different* OpenAI-compatible endpoints,
 * each configured entirely through environment variables so base URLs,
 * credentials and model ids can be swapped without code changes:
 *
 *   Chat (Bluesminds gateway):
 *     - OPENAI_API_KEY    — credential (required for the agent to function)
 *     - OPENAI_BASE_URL   — OpenAI-compatible base URL (must include /v1)
 *     - OPENAI_CHAT_MODEL — chat model id
 *
 *   Embeddings (OpenRouter):
 *     - OPENAI_EMBEDDING_API_KEY  — credential (falls back to OPENAI_API_KEY)
 *     - OPENAI_EMBEDDING_BASE_URL — base URL (falls back to OPENAI_BASE_URL)
 *     - OPENAI_EMBEDDING_MODEL    — embedding model id (must emit 1536 dims to
 *                                   match the `by_embedding` vector index)
 *
 * Providers read these lazily at request time, so these module-level instances
 * are safe to construct on deployments where the keys are not yet set — only
 * actual LLM calls will fail.
 */
export const CHAT_MODEL_ID =
  process.env.OPENAI_CHAT_MODEL ?? "deepseek-v4-flash";

/** 1536 dimensions — matches the `by_embedding` vector index on `issues`. */
export const EMBEDDING_MODEL_ID =
  process.env.OPENAI_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

/** Chat provider — the Bluesminds OpenAI-compatible gateway. */
const chatProvider = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

/** Embedding provider — OpenRouter (separate URL + key from chat). */
const embeddingProvider = createOpenAI({
  baseURL:
    process.env.OPENAI_EMBEDDING_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    undefined,
  apiKey: process.env.OPENAI_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
});

export const chatModel = chatProvider.chat(CHAT_MODEL_ID);

export const embeddingModel = embeddingProvider.embedding(EMBEDDING_MODEL_ID);

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const AI_NOT_CONFIGURED_MESSAGE =
  "The AI agent is not configured yet: the OPENAI_API_KEY environment variable is missing on the Convex deployment.";

export function assertAiConfigured(): void {
  if (!isAiConfigured()) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
}
