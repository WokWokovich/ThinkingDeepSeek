import { storage } from "#imports";

export const copyButtonEnabled = storage.defineItem<boolean>(
  "local:copyButtonEnabled",
  { fallback: true },
);

export const previousThinkingEnabled = storage.defineItem<boolean>(
  "local:previousThinkingEnabled",
  { fallback: true },
);
