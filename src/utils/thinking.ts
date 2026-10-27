const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const SLASH = String.fromCharCode(47);
const NL = String.fromCharCode(10);
const TAG_NAME = "previous_thinking";
export const TAG_OPEN = LT + TAG_NAME + GT;
export const TAG_CLOSE = LT + SLASH + TAG_NAME + GT;

const CHAT_PREFIX = SLASH + "api" + SLASH + "v0" + SLASH + "chat" + SLASH;
const CHAT_HOST = "chat.deepseek.com";

/**
 * Removes every <previous_thinking>...</previous_thinking> block, including
 * nested ones, together with its content. The content is dropped on purpose:
 * an echoed tag inside a reasoning block must not be attached again, otherwise
 * the model echoes it forever. Text outside the wrappers is preserved.
 */
export function stripWrappedThinking(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(TAG_OPEN, i);
    if (start === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, start);
    let depth = 1;
    let j = start + TAG_OPEN.length;
    while (j < text.length && depth > 0) {
      const nextOpen = text.indexOf(TAG_OPEN, j);
      const nextClose = text.indexOf(TAG_CLOSE, j);
      if (nextClose === -1) {
        // unclosed wrapper: drop everything from here on
        return out.trim();
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + TAG_OPEN.length;
      } else {
        depth--;
        j = nextClose + TAG_CLOSE.length;
      }
    }
    i = j;
  }
  return out.trim();
}

export function buildWrapped(thinking: string): string {
  return TAG_OPEN + NL + thinking + NL + TAG_CLOSE + NL + NL;
}

export function injectIntoContent(
  content: unknown,
  wrapped: string,
): { changed: boolean; value: unknown } {
  if (typeof content === "string") {
    if (content.indexOf(TAG_OPEN) !== -1) return { changed: false, value: content };
    return { changed: true, value: wrapped + content };
  }
  if (Array.isArray(content)) {
    for (let i = content.length - 1; i >= 0; i--) {
      const part = content[i];
      if (part && part.type === "text" && typeof part.text === "string") {
        if (part.text.indexOf(TAG_OPEN) !== -1) return { changed: false, value: content };
        part.text = wrapped + part.text;
        return { changed: true, value: content };
      }
    }
    content.push({ type: "text", text: wrapped });
    return { changed: true, value: content };
  }
  return { changed: false, value: content };
}

export function inject(bodyText: string, thinking: string): string {
  try {
    const cleaned = stripWrappedThinking(thinking);
    if (!cleaned) return bodyText;
    const wrapped = buildWrapped(cleaned);
    const body = JSON.parse(bodyText);
    if (typeof body !== "object" || body === null) return bodyText;

    if (Array.isArray(body.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const msg = body.messages[i];
        if (msg && msg.role === "user" && msg.content != null) {
          const res = injectIntoContent(msg.content, wrapped);
          if (res.changed) msg.content = res.value;
          return JSON.stringify(body);
        }
      }
    }

    if (typeof body.prompt === "string") {
      if (body.prompt.indexOf(TAG_OPEN) !== -1) return JSON.stringify(body);
      body.prompt = wrapped + body.prompt;
      return JSON.stringify(body);
    }

    return bodyText;
  } catch {
    return bodyText;
  }
}

export function isCompletionEndpoint(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (host !== CHAT_HOST) return false;
  if (url.indexOf(CHAT_PREFIX) === -1) return false;
  if (url.indexOf("pow_challenge") !== -1) return false;
  if (url.indexOf("history_messages") !== -1) return false;
  return url.indexOf("chat_session") === -1;

}
