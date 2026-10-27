import { defineConfig } from "wxt";

const COLON = String.fromCharCode(58);
const SLASH = String.fromCharCode(47);
const STAR = String.fromCharCode(42);
const SEP = COLON + SLASH + SLASH;
const MATCH = "https" + SEP + "chat.deepseek.com" + SLASH + STAR;

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Thinking DeepSeek",
    description: "Copy thinking blocks and attach previous thinking on chat.deepseek.com",
    permissions: ["storage"],
    host_permissions: [MATCH],
    ...(browser === "firefox"
      ? {
          icons: { "128": "icon.svg" },
          action: { default_icon: "icon.svg" },
          browser_specific_settings: {
            gecko: {
              id: "thinking-deepseek@local",
              strict_min_version: "158.0",
              data_collection_permissions: { required: ["none"] },
            },
            gecko_android: {
              strict_min_version: "158.0",
            },
          },
        }
      : {}),
  }),
});
