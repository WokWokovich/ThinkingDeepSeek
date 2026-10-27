import { describe, it, expect } from "vitest";
import {
  stripWrappedThinking,
  injectIntoContent,
  inject,
  isCompletionEndpoint,
} from "./thinking";

const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const SLASH = String.fromCharCode(47);
const NL = String.fromCharCode(10);
const OPEN = LT + "previous_thinking" + GT;
const CLOSE = LT + SLASH + "previous_thinking" + GT;
const WRAPPED = OPEN + NL + "T" + NL + CLOSE + NL + NL;

describe("stripWrappedThinking", () => {
  it("returns trimmed text when no tag", () => {
    expect(stripWrappedThinking("  hello  ")).toBe("hello");
  });
  it("drops the whole block when it is the only content", () => {
    expect(stripWrappedThinking(OPEN + "inner" + CLOSE)).toBe("");
  });
  it("drops nested blocks", () => {
    expect(stripWrappedThinking(OPEN + "a" + OPEN + "b" + CLOSE + "c" + CLOSE)).toBe("");
  });
  it("keeps text outside the block", () => {
    expect(stripWrappedThinking("before" + OPEN + "x" + CLOSE + "after")).toBe("beforeafter");
  });
  it("drops unclosed tag and everything after it", () => {
    expect(stripWrappedThinking("before " + OPEN + "after")).toBe("before");
  });
});

describe("injectIntoContent", () => {
  it("prepends to string", () => {
    const res = injectIntoContent("hello", WRAPPED);
    expect(res.changed).toBe(true);
    expect(res.value).toBe(WRAPPED + "hello");
  });
  it("prepends to first text part", () => {
    const content = [{ type: "text", text: "hello" }];
    const res = injectIntoContent(content, WRAPPED);
    expect(res.changed).toBe(true);
    expect((res.value as any)[0].text).toBe(WRAPPED + "hello");
  });
  it("pushes a text part when none exists", () => {
    const content = [{ type: "image", url: "x" }];
    const res = injectIntoContent(content, WRAPPED);
    expect(res.changed).toBe(true);
    expect((res.value as any).length).toBe(2);
    expect((res.value as any)[1].text).toBe(WRAPPED);
  });
  it("skips already-tagged string", () => {
    const res = injectIntoContent(WRAPPED + "hello", WRAPPED);
    expect(res.changed).toBe(false);
  });
  it("skips non-string non-array", () => {
    const res = injectIntoContent(42, WRAPPED);
    expect(res.changed).toBe(false);
  });
});

describe("inject", () => {
  it("injects into string user message", () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "hello" }] });
    const out = JSON.parse(inject(body, "T"));
    expect(out.messages[0].content).toBe(WRAPPED + "hello");
  });
  it("injects into array user message with text part", () => {
    const body = JSON.stringify({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    const out = JSON.parse(inject(body, "T"));
    expect(out.messages[0].content[0].text).toBe(WRAPPED + "hello");
  });
  it("injects into prompt", () => {
    const body = JSON.stringify({ prompt: "hello" });
    const out = JSON.parse(inject(body, "T"));
    expect(out.prompt).toBe(WRAPPED + "hello");
  });
  it("does not double-inject", () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: WRAPPED + "hello" }] });
    const out = JSON.parse(inject(body, "T"));
    expect(out.messages[0].content).toBe(WRAPPED + "hello");
  });
  it("returns original on invalid JSON", () => {
    expect(inject("not json", "T")).toBe("not json");
  });
  it("returns original when no user message", () => {
    const body = JSON.stringify({ messages: [{ role: "assistant", content: "hi" }] });
    expect(inject(body, "T")).toBe(body);
  });
});

describe("isCompletionEndpoint", () => {
  it("accepts chat completion", () => {
    expect(isCompletionEndpoint("https://chat.deepseek.com/api/v0/chat/completion")).toBe(true);
  });
  it("rejects pow_challenge", () => {
    expect(isCompletionEndpoint("https://chat.deepseek.com/api/v0/chat/pow_challenge")).toBe(false);
  });
  it("rejects history_messages", () => {
    expect(isCompletionEndpoint("https://chat.deepseek.com/api/v0/chat/history_messages")).toBe(false);
  });
  it("rejects chat_session", () => {
    expect(isCompletionEndpoint("https://chat.deepseek.com/api/v0/chat/chat_session")).toBe(false);
  });
  it("rejects foreign host", () => {
    expect(isCompletionEndpoint("https://example.com/api/v0/chat/completion")).toBe(false);
  });
  it("rejects malformed url", () => {
    expect(isCompletionEndpoint("not a url")).toBe(false);
  });
});
