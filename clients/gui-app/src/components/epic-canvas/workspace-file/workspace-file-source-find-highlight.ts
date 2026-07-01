/**
 * Source-preview text-range painting for workspace-file find.
 *
 * The markdown-preview path drives `FindEngine`, which *searches* the rendered
 * DOM itself. Source preview can't reuse that: Shiki splits a line into many
 * token `<span>`s, so a match that straddles a token boundary lives across
 * several text nodes and a per-text-node `indexOf` would miss it. The source
 * adapter therefore searches the raw file string and produces absolute
 * character offsets; this module maps those offsets back onto the rendered DOM
 * and paints them with the same CSS Custom Highlight API (and the same
 * `traycer-find-match*` highlight names styled in `index.css`) so multiple
 * matches on one line are individually visible and the active one stands out.
 *
 * The concatenated text content of the code container equals the file content
 * verbatim for both render paths - the plain `<pre>` fallback (a single text
 * node) and Shiki output (line spans joined by `\n` text nodes) - so a flat
 * walk of the container's text nodes yields a faithful offset map.
 */

const FIND_HIGHLIGHT_NAME = "traycer-find-match";
const FIND_HIGHLIGHT_ACTIVE_NAME = "traycer-find-match-active";

export interface SourceFindRange {
  readonly offset: number;
  readonly length: number;
}

interface SupportedHighlightsAPI {
  set(name: string, highlight: Highlight): void;
  delete(name: string): void;
}

function getHighlights(): SupportedHighlightsAPI | null {
  if (typeof CSS === "undefined") return null;
  if (typeof Highlight === "undefined") return null;
  const reg = (CSS as { highlights?: SupportedHighlightsAPI }).highlights;
  return reg ?? null;
}

interface TextNodeSpan {
  readonly node: Text;
  readonly start: number;
}

function collectTextSpans(root: HTMLElement): readonly TextNodeSpan[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const spans: TextNodeSpan[] = [];
  let offset = 0;
  let node = walker.nextNode() as Text | null;
  while (node !== null) {
    spans.push({ node, start: offset });
    offset += node.data.length;
    node = walker.nextNode() as Text | null;
  }
  return spans;
}

// Resolves an absolute character position to a (text node, in-node offset)
// pair. Positions at a node boundary resolve to the end of the earlier node,
// which is the same DOM point as the start of the next - fine for both range
// endpoints. Positions past the end clamp to the final node so a slightly
// short last text node (e.g. a trailing-newline quirk) never throws.
function resolvePoint(
  spans: readonly TextNodeSpan[],
  position: number,
): { readonly node: Text; readonly offset: number } | null {
  if (spans.length === 0) return null;
  for (const span of spans) {
    const end = span.start + span.node.data.length;
    if (position <= end) {
      return { node: span.node, offset: Math.max(0, position - span.start) };
    }
  }
  const last = spans[spans.length - 1];
  return { node: last.node, offset: last.node.data.length };
}

function buildRange(
  spans: readonly TextNodeSpan[],
  range: SourceFindRange,
): Range | null {
  if (range.length <= 0) return null;
  const start = resolvePoint(spans, range.offset);
  const end = resolvePoint(spans, range.offset + range.length);
  if (start === null || end === null) return null;
  const domRange = new Range();
  domRange.setStart(start.node, start.offset);
  domRange.setEnd(end.node, end.offset);
  return domRange;
}

export function clearSourceFindHighlights(): void {
  const reg = getHighlights();
  if (reg === null) return;
  reg.delete(FIND_HIGHLIGHT_NAME);
  reg.delete(FIND_HIGHLIGHT_ACTIVE_NAME);
}

/**
 * Paints every match span under the code container, with the active span in
 * the stronger `*-active` highlight so navigation between same-line matches is
 * visible. No-ops (clearing any prior paint) when the Custom Highlight API is
 * unavailable so unsupported browsers fall back to the gutter line marker.
 */
export function paintSourceFindHighlights(args: {
  readonly root: HTMLElement;
  readonly matches: readonly SourceFindRange[];
  readonly activeOffset: number;
}): void {
  const reg = getHighlights();
  if (reg === null) return;

  const spans = collectTextSpans(args.root);
  const inactive: Range[] = [];
  let active: Range | null = null;
  for (const match of args.matches) {
    const domRange = buildRange(spans, match);
    if (domRange === null) continue;
    if (match.offset === args.activeOffset && active === null) {
      active = domRange;
    } else {
      inactive.push(domRange);
    }
  }

  if (inactive.length > 0) {
    reg.set(FIND_HIGHLIGHT_NAME, new Highlight(...inactive));
  } else {
    reg.delete(FIND_HIGHLIGHT_NAME);
  }
  if (active !== null) {
    reg.set(FIND_HIGHLIGHT_ACTIVE_NAME, new Highlight(active));
  } else {
    reg.delete(FIND_HIGHLIGHT_ACTIVE_NAME);
  }
}
