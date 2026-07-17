/**
 * Thin Telegram Bot API client (Track: Telegram integration).
 *
 * Pure helpers over `fetch` — no Convex ctx, no Node APIs. The bot token is
 * always passed in explicitly from a `telegramIntegrations` record; this module
 * never reads it from the environment or the database.
 *
 * Telegram Bot API reference: https://core.telegram.org/bots/api
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Telegram caps a single sendMessage `text` at 4096 characters. */
const MAX_MESSAGE_LENGTH = 4096;

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function callTelegram<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = (await response.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new Error(
      `Telegram API ${method} failed: ${data.description ?? response.statusText}`
    );
  }
  return data.result as T;
}

export type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

/** Validate a bot token and fetch the bot's identity (used on connect). */
export async function getMe(botToken: string): Promise<TelegramBotInfo> {
  return await callTelegram<TelegramBotInfo>(botToken, "getMe", {});
}

/**
 * Point the bot's updates at our webhook. `secretToken` is echoed back by
 * Telegram in the `X-Telegram-Bot-Api-Secret-Token` header on every request,
 * letting us reject forged calls.
 */
export async function setWebhook(
  botToken: string,
  url: string,
  secretToken: string
): Promise<void> {
  await callTelegram<boolean>(botToken, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

/** Stop the bot from receiving updates (used on disconnect). */
export async function deleteWebhook(botToken: string): Promise<void> {
  await callTelegram<boolean>(botToken, "deleteWebhook", {
    drop_pending_updates: true,
  });
}

/**
 * Send a message to a chat. Long replies are split across multiple messages so
 * we never exceed Telegram's 4096-char limit. Uses Markdown; if Telegram
 * rejects the entity parsing we retry once as plain text so a stray character
 * never swallows the whole reply.
 */
export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  const chunks = splitMessage(text.trim() || "…");
  for (const chunk of chunks) {
    try {
      await callTelegram<unknown>(botToken, "sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    } catch {
      // Fall back to unformatted text if Markdown parsing fails.
      await callTelegram<unknown>(botToken, "sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      });
    }
  }
}

/** Split on paragraph/line boundaries where possible, hard-cut otherwise. */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let cut = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (cut <= 0) {
      cut = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n+/, "");
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}
