import "../styles/content.css";
import { copyButtonEnabled, previousThinkingEnabled } from "../utils/settings";
import { SELECTORS, queryAll, topLevelOnly, getThinkingText } from "../utils/dom";
import { stripWrappedThinking, buildWrapped, TAG_OPEN, TAG_CLOSE } from "../utils/thinking";

const STAR = String.fromCharCode(42);
const SLASH = String.fromCharCode(47);
const TAG_NAME = "previous_thinking";
const MAX_THINKING_LEN = 50000;
const SYNC_DELAY = 800;
const HIDDEN_CLASS = "tds-raw-tag-hidden";

function log(...args: any[]) {
  console.log("[TDS]", ...args);
}

export default defineContentScript({
  matches: ["https" + String.fromCharCode(58) + SLASH + SLASH + "chat.deepseek.com" + SLASH + STAR],
  runAt: "document_start",
  main() {
    log("content start");

    let copyEnabled = true;
    let prevEnabled = true;
    let toastTimer: number | undefined;
    let syncTimer: number | undefined;
    let lastThinkingCache: string | null = null;
    let lastConvPath = location.pathname;
    let suppressObserver = false;
    let lastSignature = "";
    let lastBroadcastKey = "";

    function computeSignature(): string {
      const turns = queryAll(document, SELECTORS.userTurn) as HTMLElement[];
      const blocks = queryAll(document, SELECTORS.thinkingBlock) as HTMLElement[];
      const lastTurnLen = turns.length ? (turns[turns.length - 1].textContent || "").length : 0;
      const lastBlockLen = blocks.length ? (blocks[blocks.length - 1].textContent || "").length : 0;
      return turns.length + ":" + blocks.length + ":" + lastTurnLen + ":" + lastBlockLen;
    }

    function broadcastPreviousThinking(text: string | null, force = false) {
      const key = text === null ? "N" : "T" + text;
      if (!force && key === lastBroadcastKey) return;
      lastBroadcastKey = key;
      window.postMessage({ type: "TDS_PREVIOUS_THINKING", text }, STAR);
    }

    // handshake from main-world
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (data && data.type === "TDS_MAIN_WORLD_READY") {
        log("main-world ready, resending state");
        broadcastPreviousThinking(prevEnabled ? lastThinkingCache : null, true);
      }
    });

    function showToast(message: string) {
      document.querySelector(".tds-toast")?.remove();
      const toast = document.createElement("div");
      toast.className = "tds-toast";
      toast.textContent = message;
      document.body.appendChild(toast);
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.remove(), 2000);
    }

    async function copyText(text: string): Promise<boolean> {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        // fall through to execCommand
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }

    function extractAllThinking(turn: HTMLElement): string[] {
      const raw = turn.textContent || "";
      const out: string[] = [];

      const nodes = turn.querySelectorAll(TAG_NAME);
      for (let i = 0; i < nodes.length; i++) {
        const t = (nodes[i].textContent || "").trim();
        if (t) out.push(t);
      }

      let idx = 0;
      while (true) {
        const start = raw.indexOf(TAG_OPEN, idx);
        if (start === -1) break;
        const end = raw.indexOf(TAG_CLOSE, start + TAG_OPEN.length);
        if (end === -1) break;
        const inner = raw.slice(start + TAG_OPEN.length, end).trim();
        if (inner && out.indexOf(inner) === -1) out.push(inner);
        idx = end + TAG_CLOSE.length;
      }

      return out;
    }

    function hideRawTagText(turn: HTMLElement) {
      try {
        const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
        const targets: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const t = node as Text;
          const parent = t.parentElement;
          if (parent && parent.classList.contains(HIDDEN_CLASS)) continue;
          const content = t.textContent || "";
          if (content.indexOf(TAG_OPEN) !== -1) targets.push(t);
        }

        for (const textNode of targets) {
          const content = textNode.textContent || "";
          const frag = document.createDocumentFragment();
          let idx = 0;
          let replaced = false;
          while (idx < content.length) {
            const start = content.indexOf(TAG_OPEN, idx);
            if (start === -1) {
              frag.appendChild(document.createTextNode(content.slice(idx)));
              break;
            }
            if (start > idx) {
              frag.appendChild(document.createTextNode(content.slice(idx, start)));
            }
            const end = content.indexOf(TAG_CLOSE, start + TAG_OPEN.length);
            if (end === -1) {
              frag.appendChild(document.createTextNode(content.slice(start)));
              break;
            }
            const span = document.createElement("span");
            span.className = HIDDEN_CLASS;
            span.textContent = content.slice(start, end + TAG_CLOSE.length);
            frag.appendChild(span);
            replaced = true;
            idx = end + TAG_CLOSE.length;
          }
          if (replaced && textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
          }
        }
      } catch (e) {
        log("hideRawTagText failed", e);
      }
    }

    function findComposer(): HTMLElement | null {
      const area = document.querySelector("textarea") as HTMLTextAreaElement | null;
      if (area) return area;
      return document.querySelector("[contenteditable=true]") as HTMLElement | null;
    }

    function composerText(el: HTMLElement): string {
      if (el instanceof HTMLTextAreaElement) return el.value;
      return el.innerText || "";
    }

    function insertTextInto(el: HTMLElement, block: string): boolean {
      el.focus();
      if (el instanceof HTMLTextAreaElement) {
        el.setSelectionRange(0, 0);
      } else {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      const ok = document.execCommand("insertText", false, block);
      if (ok) return true;

      // fallback: mutate the value directly and notify the framework
      try {
        if (el instanceof HTMLTextAreaElement) {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          setter?.call(el, block + el.value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        el.textContent = block + (el.textContent || "");
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return true;
      } catch (e) {
        log("insert fallback failed", e);
        return false;
      }
    }

    function prependToComposer() {
      if (!prevEnabled) return;
      const thinking = lastThinkingCache;
      if (!thinking) return;
      const el = findComposer();
      if (!el) return;
      const current = composerText(el).trim();
      if (!current || current.indexOf(TAG_NAME) !== -1) return;
      const block = buildWrapped(thinking);
      const ok = insertTextInto(el, block);
      log("prepend ok=", ok, "len=", block.length);
    }

    document.addEventListener(
      "keydown",
      (event) => {
        const ke = event as KeyboardEvent;
        if (ke.key === "Enter" && !ke.shiftKey && !ke.isComposing) {
          prependToComposer();
        }
      },
      true,
    );

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as HTMLElement | null;
        const btn = target?.closest?.("button, [role=button]") as HTMLElement | null;
        if (!btn) return;
        const label = ((btn.getAttribute("aria-label") || "") + " " + btn.className).toLowerCase();
        if (label.indexOf("send") !== -1 || label.indexOf("submit") !== -1) {
          prependToComposer();
        }
      },
      true,
    );

    function createCopyButton(block: HTMLElement): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.className = "tds-copy-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Copy thinking");
      const LT = String.fromCharCode(60);
      const GT = String.fromCharCode(62);
      const Q = String.fromCharCode(34);
      const SL = String.fromCharCode(47);
      btn.innerHTML = [
        LT + "svg viewBox=" + Q + "0 0 24 24" + Q,
        " fill=" + Q + "none" + Q,
        " stroke=" + Q + "currentColor" + Q,
        " stroke-width=" + Q + "2" + Q,
        " stroke-linecap=" + Q + "round" + Q,
        " stroke-linejoin=" + Q + "round" + Q,
        " aria-hidden=" + Q + "true" + Q + GT,
        LT + "rect x=" + Q + "9" + Q,
        " y=" + Q + "9" + Q,
        " width=" + Q + "13" + Q,
        " height=" + Q + "13" + Q,
        " rx=" + Q + "2" + Q,
        " ry=" + Q + "2" + Q + GT,
        LT + SL + "rect" + GT,
        LT + "path d=" + Q +
          "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" +
          Q + GT,
        LT + SL + "path" + GT,
        LT + SL + "svg" + GT,
      ].join("");
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = await copyText(getThinkingText(block));
        showToast(ok ? "Copied" : "Copy failed");
      });
      return btn;
    }

    function syncCopyButtons(enabled: boolean) {
      const allBlocks = queryAll(document, SELECTORS.thinkingBlock);
      const blocks = topLevelOnly(allBlocks);
      for (const block of blocks) {
        const existing = block.querySelector(".tds-copy-btn");
        if (enabled && !existing) {
          if (getThinkingText(block)) {
            block.classList.add("tds-thinking-host");
            block.appendChild(createCopyButton(block as HTMLElement));
          }
        } else if (!enabled && existing) {
          existing.remove();
          block.classList.remove("tds-thinking-host");
        }
      }
    }

    function updateThinkingCache(): string | null {
      const all = queryAll(document, SELECTORS.thinkingBlock) as HTMLElement[];
      const topLevel = topLevelOnly(all) as HTMLElement[];

      // The last element in DOM order is the most recent message.
      if (topLevel.length > 0) {
        const lastBlock = topLevel[topLevel.length - 1];
        const text = getThinkingText(lastBlock);
        if (text) {
          const cleaned = stripWrappedThinking(text);
          if (cleaned && cleaned.length <= MAX_THINKING_LEN) {
            if (cleaned !== lastThinkingCache) {
              log("cache updated, len=" + cleaned.length);
              lastThinkingCache = cleaned;
            }
          }
        }
      }
      return lastThinkingCache;
    }

    function renderTurnPreviews(turn: HTMLElement, extracted: string[], enabled: boolean) {
      hideRawTagText(turn);

      const desired = enabled ? extracted : [];
      const existing = Array.from(
        turn.querySelectorAll(":scope > .tds-previous-thinking"),
      ) as HTMLElement[];

      for (let i = desired.length; i < existing.length; i++) {
        existing[i].remove();
      }

      for (let i = 0; i < desired.length; i++) {
        const text = desired[i];
        let box = existing[i];
        if (!box) {
          box = document.createElement("div");
          box.className = "tds-previous-thinking";
          const label = document.createElement("div");
          label.className = "tds-previous-thinking-label";
          label.textContent = "Previous thinking";
          const pre = document.createElement("pre");
          pre.className = "tds-previous-thinking-content";
          box.appendChild(label);
          box.appendChild(pre);
          turn.prepend(box);
        }
        const pre = box.querySelector(".tds-previous-thinking-content") as HTMLElement | null;
        if (pre && pre.textContent !== text) {
          pre.textContent = text;
        }
      }
    }

    function syncPreviousThinkingPreview(enabled: boolean) {
      const turns = queryAll(document, SELECTORS.userTurn) as HTMLElement[];

      for (const turn of turns) {
        const extracted = extractAllThinking(turn);
        renderTurnPreviews(turn, extracted, enabled);
      }

      const thinking = enabled ? updateThinkingCache() : null;
      broadcastPreviousThinking(thinking);
    }

    function syncAll(force: boolean) {
      if (location.pathname !== lastConvPath) {
        lastConvPath = location.pathname;
        lastThinkingCache = null;
      }
      const sig = computeSignature();
      if (!force && sig === lastSignature) return;
      lastSignature = sig;
      syncCopyButtons(copyEnabled);
      syncPreviousThinkingPreview(prevEnabled);
    }

    function runSync(force: boolean) {
      suppressObserver = true;
      try {
        syncAll(force);
      } finally {
        window.setTimeout(() => {
          suppressObserver = false;
        }, 0);
      }
    }

    function scheduleSync() {
      if (syncTimer) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => runSync(false), SYNC_DELAY);
    }

    async function loadSettings() {
      try {
        copyEnabled = await copyButtonEnabled.getValue();
        prevEnabled = await previousThinkingEnabled.getValue();
        log("settings: copy=", copyEnabled, "prev=", prevEnabled);
      } catch (e) {
        log("settings load failed, using defaults", e);
        copyEnabled = true;
        prevEnabled = true;
      }
      runSync(true);
    }

    copyButtonEnabled.watch((value) => {
      copyEnabled = value;
      runSync(true);
    });

    previousThinkingEnabled.watch((value) => {
      prevEnabled = value;
      runSync(true);
    });

    const observer = new MutationObserver(() => {
      if (suppressObserver) return;
      scheduleSync();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    loadSettings();
  },
});
