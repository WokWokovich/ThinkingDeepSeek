import { stripWrappedThinking, inject, isCompletionEndpoint } from "../utils/thinking";

const COLON = String.fromCharCode(58);
const SLASH = String.fromCharCode(47);
const STAR = String.fromCharCode(42);
const SEP = COLON + SLASH + SLASH;
const MATCH = "https" + SEP + "chat.deepseek.com" + SLASH + STAR;

function log(...args: any[]) {
  console.log("[TDS-MW]", ...args);
}

export default defineContentScript({
  matches: [MATCH],
  runAt: "document_start",
  world: "MAIN",
  main() {
    log("main-world start");

    let previousThinking = "";
    let lastLoggedLen = -1;

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (data && data.type === "TDS_PREVIOUS_THINKING") {
        const raw = typeof data.text === "string" ? data.text : "";
        const cleaned = stripWrappedThinking(raw);
        previousThinking = cleaned;
        if (cleaned.length !== lastLoggedLen) {
          lastLoggedLen = cleaned.length;
          log("thinking len=", cleaned.length);
        }
      }
    });

    // handshake: content script replies with the current value once we are up
    window.postMessage({ type: "TDS_MAIN_WORLD_READY" }, STAR);

    const originalFetch = (window as any).fetch;
    if (typeof originalFetch === "function") {
      (window as any).fetch = function (input: any, init?: any) {
        try {
          const isReq = input instanceof Request;
          const url = isReq ? input.url : String(input);
          const method = String((init && init.method) || (isReq ? input.method : "GET")).toUpperCase();
          if (previousThinking && method === "POST" && isCompletionEndpoint(url)) {
            if (!isReq && init && typeof init.body === "string") {
              return originalFetch.call(this, input, { ...init, body: inject(init.body, previousThinking) });
            }
            if (isReq) {
              const req = input;
              return req.clone().text().then((text) => {
                const body = inject(text, previousThinking);
                const rebuilt = new Request(req.url, {
                  method: req.method,
                  headers: new Headers(req.headers),
                  body,
                  credentials: req.credentials,
                  mode: req.mode,
                  cache: req.cache,
                  redirect: req.redirect,
                  signal: req.signal,
                });
                return originalFetch.call(this, rebuilt);
              });
            }
          }
        } catch (e) {
          log("fetch patch error:", e);
        }
        return originalFetch.call(this, input, init);
      };
    } else {
      log("fetch unavailable, skipping patch");
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    (XMLHttpRequest.prototype as any).open = function (
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      (this as any).__tdsUrl = String(url);
      return (originalOpen as any).call(this, method, url, ...rest);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    (XMLHttpRequest.prototype as any).send = function (body?: any) {
      try {
        const u = String((this as any).__tdsUrl ?? "");
        if (previousThinking && typeof body === "string" && isCompletionEndpoint(u)) {
          log("xhr inject", u);
          body = inject(body, previousThinking);
        }
      } catch (e) {
        log("xhr patch error:", e);
      }
      return (originalSend as any).call(this, body);
    };
  },
});
