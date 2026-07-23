/**
 * Clipboard helpers that force black-on-white paste from themed answer
 * readbacks. On-screen colors are unchanged; only the clipboard payload is
 * rewritten on copy.
 */

export const NEXUS_NEUTRAL_COPY_ATTR = "data-nexus-neutral-copy";

export const NEUTRAL_COPY_STYLE = "color:#000000;background-color:#ffffff";

/** True when the live selection intersects a marked neutral-copy container. */
export function selectionIntersectsNeutralCopyRoot(
  selection: Selection | null,
  root?: ParentNode | null,
): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount < 1) {
    return false;
  }
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor && !focus) return false;

  const inMarked = (node: Node | null): boolean => {
    if (!node) return false;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (!el) return false;
    if (root && !root.contains(el)) return false;
    return Boolean(el.closest(`[${NEXUS_NEUTRAL_COPY_ATTR}]`));
  };

  return inMarked(anchor) || inMarked(focus);
}

/**
 * Build a black-on-white HTML fragment from a DOM subtree (typically a
 * selection clone). Strips theme class/style attributes so nested nodes cannot
 * reintroduce page colors.
 */
export function buildNeutralCopyHtml(source: ParentNode): string {
  const wrap = document.createElement("div");
  wrap.setAttribute("style", NEUTRAL_COPY_STYLE);

  const clone = source.cloneNode(true) as ParentNode;
  // cloneNode on DocumentFragment / Element both work; normalize to children.
  const nodes =
    clone.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ? Array.from((clone as DocumentFragment).childNodes)
      : [clone as Node];

  for (const node of nodes) {
    wrap.appendChild(node);
  }

  wrap.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("class");
    el.removeAttribute("style");
    el.setAttribute("style", NEUTRAL_COPY_STYLE);
  });

  return wrap.outerHTML;
}

/** Build neutral HTML from the current window selection ranges. */
export function buildNeutralCopyHtmlFromSelection(selection: Selection): string {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < selection.rangeCount; i += 1) {
    fragment.appendChild(selection.getRangeAt(i).cloneContents());
  }
  return buildNeutralCopyHtml(fragment);
}

/**
 * Clipboard `copy` handler. When the selection is inside a marked answer
 * readback, replaces text/html with black-on-white and keeps text/plain.
 * Returns true when the event was handled.
 */
export function handleNeutralCopyEvent(
  event: ClipboardEvent,
  root?: ParentNode | null,
): boolean {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!selectionIntersectsNeutralCopyRoot(selection, root)) {
    return false;
  }
  if (!event.clipboardData) {
    return false;
  }

  const plain = selection!.toString();
  if (!plain) {
    return false;
  }

  const html = buildNeutralCopyHtmlFromSelection(selection!);
  event.preventDefault();
  event.clipboardData.setData("text/plain", plain);
  event.clipboardData.setData("text/html", html);
  return true;
}
