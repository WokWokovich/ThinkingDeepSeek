// NOTE(duplicate-paragraphs): the site can render the same paragraph twice in a
// thinking block. getThinkingText() therefore returns the duplicate text as-is;
// dedupe is a separate follow-up task, not part of the MV3 migration.
export const SELECTORS = {
  thinkingBlock: [
    "div.edb250b1",
    ".ds-think-content",
    "[class~=think-content]",
  ],
  userTurn: ["div.fbb737a4"],
};

export function queryAll(root: ParentNode, selectors: string[]): Element[] {
  if (!selectors.length) return [];
  try {
    // Join selectors with a comma so querySelectorAll deduplicates them natively
    // and always returns elements in DOM order (top to bottom).
    return Array.from(root.querySelectorAll(selectors.join(", ")));
  } catch {
    return [];
  }
}

/**
 * Filters out elements that are children of other elements in the list.
 * This prevents double-processing when a selector matches both a wrapper
 * and its child (e.g. .ds-think-content and its nested span).
 */
export function topLevelOnly(elements: Element[]): Element[] {
  return elements.filter(
    (el) => !elements.some((other) => other !== el && other.contains(el))
  );
}

export function getThinkingText(block: Element): string {
  const el = block as HTMLElement;
  const visible = el.innerText?.trim();
  if (visible) return visible;
  return el.textContent?.trim() || "";
}
