import { lexer, type MarkedToken, type Token, type Tokens } from "marked";
import {
  answeredQuestionsSummary,
  buildChatActivityTimeline,
} from "@/components/chat/chat-activity-groups";
import { parseTraycerNextStepsMarkdown } from "@/markdown/traycer-next-steps";
import { composerClipboardPlainText } from "@/lib/composer/composer-clipboard";
import { artifactOperationVerb } from "@/lib/chat/artifact-operation-verb";
import { formatClockDuration } from "@/lib/format-duration";
import { formatSingleLine } from "@/lib/utils";
import type {
  ActivityGroupModel,
  ChatActivityTimelineItem,
} from "@/components/chat/chat-activity-groups";
import type {
  ChatMessage as ChatMessageModel,
  CommandSegment,
  FileChangeSegment,
  InterviewSegment,
  MessageSegment,
  PlanSegmentModel,
  SubagentSegment,
  ToolSegment,
} from "@/stores/composer/chat-store";
import type {
  TileFindAdapter,
  TileFindCapability,
  TileFindInput,
  TileFindStateSnapshot,
  TileReplaceInput,
} from "@/stores/tile-find";

export interface ChatFindRow {
  readonly messageId: string;
  readonly searchableText: string;
}

export interface ChatFindAdapter extends TileFindAdapter {
  updateRows(rows: ReadonlyArray<ChatFindRow>): void;
  syncMountedHighlight(): void;
  dispose(): void;
}

interface ChatFindAdapterOptions {
  readonly tileInstanceId: string;
  readonly scrollToMessage: (messageId: string) => void;
  readonly getMountedMessageRoot: (messageId: string) => HTMLElement | null;
}

interface ChatFindMatch {
  readonly messageId: string;
  readonly rowIndex: number;
  readonly start: number;
  readonly end: number;
  readonly rowMatchIndex: number;
}

interface SupportedHighlightsAPI {
  set(name: string, highlight: Highlight): void;
  delete(name: string): void;
}

interface HighlightNames {
  readonly match: string;
  readonly active: string;
}

const CHAT_FIND_CAPABILITIES: ReadonlySet<TileFindCapability> =
  new Set<TileFindCapability>(["find"]);
const EMPTY_MATCHES: ReadonlyArray<ChatFindMatch> = [];
const BUILT_IN_MARKED_TOKEN_TYPES = [
  "blockquote",
  "br",
  "checkbox",
  "code",
  "codespan",
  "def",
  "del",
  "em",
  "escape",
  "heading",
  "hr",
  "html",
  "image",
  "link",
  "list",
  "list_item",
  "paragraph",
  "space",
  "strong",
  "table",
  "text",
] as const;
const SKIPPED_HIGHLIGHT_ANCESTOR_SELECTOR = [
  "[data-find-skip]",
  "input",
  "textarea",
  "select",
  "script",
  "style",
  "noscript",
  "svg",
  "title",
  "[hidden]",
  ".sr-only",
  "[aria-hidden='true']",
].join(",");
const INCLUDED_BUTTON_HIGHLIGHT_SELECTOR = "button[data-find-include='true']";
const CHAT_FIND_PREVIEW_MAX_LENGTH = 180;

export function buildChatFindRows(
  messages: ReadonlyArray<ChatMessageModel>,
): ReadonlyArray<ChatFindRow> {
  return messages.map((message) => ({
    messageId: message.id,
    searchableText: searchableTextForMessage(message),
  }));
}

export function markdownToChatSearchText(markdown: string): string {
  return normalizeSearchableText(tokensToText(lexer(markdown, { gfm: true })));
}

export function createChatFindAdapter(
  options: ChatFindAdapterOptions,
): ChatFindAdapter {
  return new ChatFindAdapterImpl(options);
}

function searchableTextForMessage(message: ChatMessageModel): string {
  if (message.role === "assistant") {
    const turnState = message.runState === null ? "complete" : "active";
    return normalizeSearchableText(
      buildChatActivityTimeline(message.segments, { turnState })
        .flatMap(timelineItemSearchText)
        .join("\n"),
    );
  }

  const contentText =
    message.structuredContent === null
      ? message.content
      : composerClipboardPlainText(message.structuredContent);
  const segmentText = message.segments.flatMap(segmentSearchText).join("\n");
  return normalizeSearchableText([contentText, segmentText].join("\n"));
}

function timelineItemSearchText(
  item: ChatActivityTimelineItem,
): ReadonlyArray<string> {
  if (item.kind === "segment") return segmentSearchText(item.segment);
  if (item.kind === "answered_questions") {
    return [item.summary];
  }
  if (item.kind === "promoted_subagent") {
    return promotedSubagentSegmentSearchText(item.segment);
  }
  return activityGroupSearchText(item.group);
}

function activityGroupSearchText(
  group: ActivityGroupModel,
): ReadonlyArray<string> {
  return [group.label];
}

// The branch count mirrors the persisted chat segment taxonomy.
// eslint-disable-next-line complexity
function segmentSearchText(segment: MessageSegment): ReadonlyArray<string> {
  switch (segment.kind) {
    case "text":
      return parseTraycerNextStepsMarkdown(
        segment.markdown,
        segment.isStreaming,
      ).flatMap((part) => {
        if (part.kind === "markdown") {
          return [markdownToChatSearchText(part.markdown)];
        }
        return [markdownToChatSearchText(part.prose)];
      });
    case "reasoning":
      return reasoningSegmentSearchText(segment);
    case "tool":
      return toolSegmentSearchText(segment);
    case "file_change":
      return fileChangeSegmentSearchText(segment);
    case "file_change_group":
      return [fileChangeGroupSearchText(segment)];
    case "command":
      return commandSegmentSearchText(segment);
    case "subagent":
      return subagentSegmentSearchText(segment);
    case "approval":
      return [
        segment.decision?.approved === true ? "Approved" : "Denied",
        segment.toolName ?? "",
        segment.description ?? "",
      ];
    case "artifact_operation":
      return [
        normalizeSearchableText(
          [
            artifactOperationVerb(segment.operation),
            segment.artifactKind,
            segment.title ?? "",
          ].join(" "),
        ),
      ];
    case "plan":
      return planSegmentSearchText(segment);
    case "todo":
      return segment.items.map((item) =>
        normalizeSearchableText(
          [item.activeForm ?? item.text, item.status, item.priority].join(" "),
        ),
      );
    case "error":
      return [
        normalizeSearchableText([segment.message, segment.code].join(" ")),
      ];
    case "compaction":
      return [
        normalizeSearchableText(
          [segment.summary ?? "", segment.error ?? "", segment.status].join(
            " ",
          ),
        ),
      ];
    case "interview":
      return interviewSegmentSearchText(segment);
    case "forked-chat-link":
      return [
        normalizeSearchableText(`Forked from ${segment.sourceChatTitle}`),
      ];
    case "setup-card":
      return [
        normalizeSearchableText(
          [
            "Workspace setup",
            segment.model.aggregate.state,
            ...segment.model.workspaces.flatMap((workspace) => [
              workspace.label,
              workspace.workspacePath,
              workspace.worktreePath ?? "",
              workspace.branch ?? "",
              workspace.state,
            ]),
          ].join(" "),
        ),
      ];
    default: {
      const _exhaustive: never = segment;
      void _exhaustive;
      return [];
    }
  }
}

function toolSegmentSearchText(segment: ToolSegment): ReadonlyArray<string> {
  if (segment.agentMessageSend !== null) {
    return [
      normalizeSearchableText(
        [
          "Sent message",
          formatSingleLine(segment.agentMessageSend.message, {
            maxLength: CHAT_FIND_PREVIEW_MAX_LENGTH,
            ellipsis: "…",
          }),
        ].join(" "),
      ),
    ];
  }
  return [
    normalizeSearchableText(
      [
        segment.toolName,
        segment.inputSummary ?? "",
        segment.error === null || segment.error.length === 0 ? "" : "error",
      ].join(" "),
    ),
  ];
}

function fileChangeSegmentSearchText(
  segment: FileChangeSegment,
): ReadonlyArray<string> {
  return [
    normalizeSearchableText(
      [
        fileChangeVerb(segment.operation),
        segment.filePath,
        `+${segment.additions}`,
        `-${segment.deletions}`,
      ].join(" "),
    ),
  ];
}

function fileChangeGroupSearchText(
  segment: Extract<MessageSegment, { kind: "file_change_group" }>,
): string {
  const additions = segment.files.reduce(
    (total, file) => total + file.additions,
    0,
  );
  const deletions = segment.files.reduce(
    (total, file) => total + file.deletions,
    0,
  );
  return normalizeSearchableText(
    [
      "Changes",
      changeCountLabel(segment.files.length, segment.artifacts.length),
      additions > 0 ? `+${additions}` : "",
      deletions > 0 ? `-${deletions}` : "",
    ].join(" "),
  );
}

function commandSegmentSearchText(
  segment: CommandSegment,
): ReadonlyArray<string> {
  return [normalizeSearchableText(segment.command)];
}

function subagentSegmentSearchText(
  segment: SubagentSegment,
): ReadonlyArray<string> {
  return [
    normalizeSearchableText(
      [
        cleanSubagentNotificationText(segment.name) ?? "Subagent",
        cleanSubagentNotificationText(segment.agentType) ?? "",
        compactSubagentSummaryText(segment),
      ].join(" "),
    ),
  ];
}

function promotedSubagentSegmentSearchText(
  segment: SubagentSegment,
): ReadonlyArray<string> {
  const progress = compactSubagentProgressText(segment);
  return [
    normalizeSearchableText(
      [
        cleanSubagentNotificationText(segment.name) ?? "Subagent",
        cleanSubagentNotificationText(segment.agentType) ?? "",
        segment.isStreaming ? (progress ?? "Starting…") : "",
      ].join(" "),
    ),
  ];
}

function compactSubagentSummaryText(segment: SubagentSegment): string {
  if (segment.result !== null) {
    return formatSingleLine(markdownToChatSearchText(segment.result), {
      maxLength: CHAT_FIND_PREVIEW_MAX_LENGTH,
      ellipsis: "...",
    });
  }
  return (
    compactSubagentProgressText(segment) ??
    (segment.isStreaming ? "Starting…" : "")
  );
}

function compactSubagentProgressText(segment: SubagentSegment): string | null {
  const latestProgress = segment.progressUpdates.at(-1) ?? null;
  return cleanSubagentNotificationText(latestProgress);
}

function reasoningSegmentSearchText(
  segment: Extract<MessageSegment, { kind: "reasoning" }>,
): ReadonlyArray<string> {
  if (segment.isStreaming) {
    return ["Thinking", markdownToChatSearchText(segment.markdown)];
  }
  return [reasoningSummaryLabel(segment.durationMs)];
}

function planSegmentSearchText(
  segment: PlanSegmentModel,
): ReadonlyArray<string> {
  return [
    normalizeSearchableText(
      [
        segment.title ?? "",
        segment.summary ?? "",
        markdownToChatSearchText(segment.markdownPreview),
        segment.planStatus,
        ...segment.steps.map((step) => step.activeForm ?? step.text),
      ].join(" "),
    ),
  ];
}

function interviewSegmentSearchText(
  segment: InterviewSegment,
): ReadonlyArray<string> {
  if (segment.status === "streaming") return [];
  if (segment.status === "errored") return ["Question failed"];
  return [answeredQuestionsSummary(segment)];
}

function tokensToText(tokens: ReadonlyArray<Token>): string {
  return tokens
    .flatMap((token) => {
      const text = tokenToText(token);
      return text.length > 0 ? [text] : [];
    })
    .join("\n");
}

// The branch count follows marked's token union.
// eslint-disable-next-line complexity
function tokenToText(token: Token): string {
  if (!isBuiltInMarkedToken(token)) return "";

  switch (token.type) {
    case "space":
    case "hr":
    case "def":
    case "html":
    case "br":
      return "";
    case "code":
    case "codespan":
    case "escape":
    case "text":
      return token.text;
    case "image":
      return token.text;
    case "blockquote":
    case "del":
    case "em":
    case "heading":
    case "link":
    case "paragraph":
    case "strong":
      return tokensToText(token.tokens);
    case "list":
      return token.items.map(tokenToText).join("\n");
    case "list_item":
      return tokensToText(token.tokens);
    case "checkbox":
      return token.checked ? "checked" : "unchecked";
    case "table":
      return tableToText(token);
    default:
      return "";
  }
}

function tableToText(token: Tokens.Table): string {
  return [
    ...token.header.map((cell) => tokensToText(cell.tokens)),
    ...token.rows.flatMap((row) =>
      row.map((cell) => tokensToText(cell.tokens)),
    ),
  ].join("\n");
}

function isBuiltInMarkedToken(token: Token): token is MarkedToken {
  return BUILT_IN_MARKED_TOKEN_TYPES.some((type) => type === token.type);
}

function normalizeSearchableText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fileChangeVerb(operation: string): string {
  switch (operation) {
    case "delete":
      return "Delete";
    case "create":
      return "Create";
    case "ambiguous":
      return "Write";
    default:
      return "Edit";
  }
}

function changeCountLabel(fileCount: number, artifactCount: number): string {
  const parts: string[] = [];
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
  }
  if (artifactCount > 0) {
    parts.push(`${artifactCount} artifact${artifactCount > 1 ? "s" : ""}`);
  }
  return parts.join(" ");
}

function reasoningSummaryLabel(durationMs: number | null): string {
  if (durationMs === null) return "Thought";
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `Thought for ${formatClockDuration(seconds)}`;
}

function cleanSubagentNotificationText(input: string | null): string | null {
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.includes("<task-notification")) return trimmed;
  const message =
    extractTagText(trimmed, "message") ??
    extractTagText(trimmed, "prompt") ??
    extractTagText(trimmed, "task") ??
    extractTagText(trimmed, "summary") ??
    extractTagText(trimmed, "task-notification");
  const cleaned = stripMonitorEventPrefix(
    message ?? stripTaskNotificationMarkup(trimmed),
  ).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function extractTagText(input: string, tagName: string): string | null {
  const match = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`,
    "i",
  ).exec(input);
  if (match === null) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

function stripTaskNotificationMarkup(input: string): string {
  return input
    .replace(/<task-id>[\s\S]*?<\/task-id>/gi, "")
    .replace(/<task-notification\b[^>]*>/gi, "")
    .replace(/<\/task-notification>/gi, "")
    .replace(/<\/?(summary|message|prompt|task)>/gi, "");
}

function stripMonitorEventPrefix(input: string): string {
  return input.replace(/^Monitor event:\s*/i, "");
}

class ChatFindAdapterImpl implements ChatFindAdapter {
  readonly tileInstanceId: string;
  readonly tileKind = "chat" as const;

  private readonly scrollToMessage: (messageId: string) => void;
  private readonly getMountedMessageRoot: (
    messageId: string,
  ) => HTMLElement | null;
  private readonly listeners = new Set<() => void>();
  private readonly highlighter: ChatFindHighlighter;

  private rows: ReadonlyArray<ChatFindRow> = [];
  private matches: ReadonlyArray<ChatFindMatch> = EMPTY_MATCHES;
  private activeMatchIndex = 0;
  private snapshot: TileFindStateSnapshot;
  private paintFrameId: number | null = null;
  private paintGeneration = 0;

  constructor(options: ChatFindAdapterOptions) {
    this.tileInstanceId = options.tileInstanceId;
    this.scrollToMessage = options.scrollToMessage;
    this.getMountedMessageRoot = options.getMountedMessageRoot;
    this.highlighter = new ChatFindHighlighter(options.tileInstanceId);
    this.snapshot = createChatFindSnapshot({
      requestId: 0,
      status: "idle",
      query: "",
      matchCase: false,
      current: 0,
      total: 0,
      activeUnitId: null,
      exactHighlight: "none",
    });
  }

  getSnapshot(): TileFindStateSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  search(input: TileFindInput): void {
    this.cancelScheduledPaint();
    this.highlighter.clear();
    this.matches =
      input.query.length === 0
        ? EMPTY_MATCHES
        : findMatches({
            rows: this.rows,
            query: input.query,
            matchCase: input.matchCase,
          });
    this.activeMatchIndex = 0;
    this.publishMatchState({
      requestId: input.requestId,
      query: input.query,
      matchCase: input.matchCase,
      navigate: true,
    });
  }

  next(): void {
    if (this.matches.length === 0 || this.snapshot.query.length === 0) return;
    this.activeMatchIndex = (this.activeMatchIndex + 1) % this.matches.length;
    this.publishMatchState({
      requestId: this.snapshot.requestId,
      query: this.snapshot.query,
      matchCase: this.snapshot.matchCase,
      navigate: true,
    });
  }

  previous(): void {
    if (this.matches.length === 0 || this.snapshot.query.length === 0) return;
    this.activeMatchIndex =
      (this.activeMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.publishMatchState({
      requestId: this.snapshot.requestId,
      query: this.snapshot.query,
      matchCase: this.snapshot.matchCase,
      navigate: true,
    });
  }

  clear(): void {
    this.cancelScheduledPaint();
    this.highlighter.clear();
    this.snapshot = {
      ...this.snapshot,
      activeUnitId: null,
      exactHighlight: "none",
    };
    this.notify();
  }

  replaceCurrent(_input: TileReplaceInput): void {
    return undefined;
  }

  replaceAll(_input: TileReplaceInput): void {
    return undefined;
  }

  updateRows(rows: ReadonlyArray<ChatFindRow>): void {
    this.rows = rows;
    if (this.snapshot.query.length === 0) return;
    const previousActive = this.matches[this.activeMatchIndex] ?? null;
    this.matches = findMatches({
      rows,
      query: this.snapshot.query,
      matchCase: this.snapshot.matchCase,
    });
    this.activeMatchIndex = nextActiveMatchIndex(
      this.matches,
      previousActive,
      this.activeMatchIndex,
    );
    this.publishMatchState({
      requestId: this.snapshot.requestId,
      query: this.snapshot.query,
      matchCase: this.snapshot.matchCase,
      navigate: false,
    });
  }

  syncMountedHighlight(): void {
    if (this.matches.length === 0 || this.snapshot.query.length === 0) return;
    this.requestHighlightPaint();
  }

  dispose(): void {
    this.cancelScheduledPaint();
    this.highlighter.dispose();
    this.listeners.clear();
  }

  private publishMatchState(args: {
    readonly requestId: number;
    readonly query: string;
    readonly matchCase: boolean;
    readonly navigate: boolean;
  }): void {
    if (args.query.length === 0) {
      this.matches = EMPTY_MATCHES;
      this.activeMatchIndex = 0;
      this.snapshot = createChatFindSnapshot({
        requestId: args.requestId,
        status: "idle",
        query: args.query,
        matchCase: args.matchCase,
        current: 0,
        total: 0,
        activeUnitId: null,
        exactHighlight: "none",
      });
      this.highlighter.clear();
      this.notify();
      return;
    }

    if (this.matches.length === 0) {
      this.activeMatchIndex = 0;
      this.snapshot = createChatFindSnapshot({
        requestId: args.requestId,
        status: "ready",
        query: args.query,
        matchCase: args.matchCase,
        current: 0,
        total: 0,
        activeUnitId: null,
        exactHighlight: "none",
      });
      this.highlighter.clear();
      this.notify();
      return;
    }

    const activeMatch = this.matches.at(this.activeMatchIndex);
    if (activeMatch === undefined) return;
    if (args.navigate) this.scrollToMessage(activeMatch.messageId);
    this.snapshot = createChatFindSnapshot({
      requestId: args.requestId,
      status: "ready",
      query: args.query,
      matchCase: args.matchCase,
      current: this.activeMatchIndex + 1,
      total: this.matches.length,
      activeUnitId: activeMatch.messageId,
      exactHighlight: "pending",
    });
    this.notify();
    this.requestHighlightPaint();
  }

  private requestHighlightPaint(): void {
    this.cancelScheduledPaint();
    const activeMatch = this.matches.at(this.activeMatchIndex);
    if (activeMatch === undefined) return;
    const requestId = this.snapshot.requestId;
    const query = this.snapshot.query;
    const matchCase = this.snapshot.matchCase;
    const matchKey = chatFindMatchKey(activeMatch);
    const generation = this.paintGeneration + 1;
    this.paintGeneration = generation;
    this.paintFrameId = window.requestAnimationFrame(() => {
      this.paintFrameId = null;
      if (this.paintGeneration !== generation) return;
      if (this.snapshot.requestId !== requestId) return;
      if (this.snapshot.query !== query) return;
      const currentMatch = this.matches.at(this.activeMatchIndex);
      if (
        currentMatch === undefined ||
        chatFindMatchKey(currentMatch) !== matchKey
      ) {
        return;
      }
      const root = this.getMountedMessageRoot(currentMatch.messageId);
      if (root === null) return;
      const painted = this.highlighter.paint({
        root,
        query,
        matchCase,
        activeMatchIndex: currentMatch.rowMatchIndex,
      });
      if (!painted) return;
      if (this.snapshot.requestId !== requestId) return;
      this.snapshot = {
        ...this.snapshot,
        exactHighlight: "painted",
      };
      this.notify();
    });
  }

  private cancelScheduledPaint(): void {
    this.paintGeneration += 1;
    if (this.paintFrameId === null) return;
    window.cancelAnimationFrame(this.paintFrameId);
    this.paintFrameId = null;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

function createChatFindSnapshot(args: {
  readonly requestId: number;
  readonly status: TileFindStateSnapshot["status"];
  readonly query: string;
  readonly matchCase: boolean;
  readonly current: number;
  readonly total: number;
  readonly activeUnitId: string | null;
  readonly exactHighlight: TileFindStateSnapshot["exactHighlight"];
}): TileFindStateSnapshot {
  return {
    requestId: args.requestId,
    status: args.status,
    capabilities: CHAT_FIND_CAPABILITIES,
    query: args.query,
    matchCase: args.matchCase,
    replaceText: "",
    current: args.current,
    total: args.total,
    coverageMessage: null,
    errorMessage: null,
    activeUnitId: args.activeUnitId,
    exactHighlight: args.exactHighlight,
  };
}

function findMatches(input: {
  readonly rows: ReadonlyArray<ChatFindRow>;
  readonly query: string;
  readonly matchCase: boolean;
}): ReadonlyArray<ChatFindMatch> {
  const needle = input.matchCase ? input.query : input.query.toLowerCase();
  const matches: ChatFindMatch[] = [];
  input.rows.forEach((row, rowIndex) => {
    const haystack = input.matchCase
      ? row.searchableText
      : row.searchableText.toLowerCase();
    const step = Math.max(input.query.length, 1);
    let rowMatchIndex = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push({
        messageId: row.messageId,
        rowIndex,
        start: index,
        end: index + input.query.length,
        rowMatchIndex,
      });
      rowMatchIndex += 1;
      index = haystack.indexOf(needle, index + step);
    }
  });
  return matches;
}

function nextActiveMatchIndex(
  matches: ReadonlyArray<ChatFindMatch>,
  previousActive: ChatFindMatch | null,
  fallbackIndex: number,
): number {
  if (matches.length === 0) return 0;
  if (previousActive !== null) {
    const exactIndex = matches.findIndex(
      (match) =>
        match.messageId === previousActive.messageId &&
        match.start === previousActive.start &&
        match.end === previousActive.end,
    );
    if (exactIndex !== -1) return exactIndex;
    const rowIndex = matches.findIndex(
      (match) => match.messageId === previousActive.messageId,
    );
    if (rowIndex !== -1) return rowIndex;
  }
  return Math.min(fallbackIndex, matches.length - 1);
}

function chatFindMatchKey(match: ChatFindMatch): string {
  return `${match.messageId}:${match.start}:${match.end}:${match.rowMatchIndex}`;
}

class ChatFindHighlighter {
  private readonly names: HighlightNames;
  private styleElement: HTMLStyleElement | null = null;

  constructor(tileInstanceId: string) {
    const suffix = stableCssIdentSuffix(tileInstanceId);
    this.names = {
      match: `traycer-chat-find-match-${suffix}`,
      active: `traycer-chat-find-active-${suffix}`,
    };
  }

  paint(input: {
    readonly root: HTMLElement;
    readonly query: string;
    readonly matchCase: boolean;
    readonly activeMatchIndex: number;
  }): boolean {
    const highlights = getHighlights();
    if (highlights === null || typeof Highlight === "undefined") return false;
    const ranges = collectTextRanges(input);
    if (ranges.length === 0) {
      this.clear();
      return false;
    }
    this.ensureStyleElement();
    const activeIndex = Math.min(input.activeMatchIndex, ranges.length - 1);
    const active = ranges[activeIndex];
    const others = ranges.filter((_range, index) => index !== activeIndex);
    if (others.length > 0) {
      highlights.set(this.names.match, new Highlight(...others));
    } else {
      highlights.delete(this.names.match);
    }
    highlights.set(this.names.active, new Highlight(active));
    return true;
  }

  clear(): void {
    const highlights = getHighlights();
    if (highlights === null) return;
    highlights.delete(this.names.match);
    highlights.delete(this.names.active);
  }

  dispose(): void {
    this.clear();
    this.styleElement?.remove();
    this.styleElement = null;
  }

  private ensureStyleElement(): void {
    if (this.styleElement !== null) return;
    const style = document.createElement("style");
    style.dataset.traycerChatFindHighlight = this.names.match;
    style.textContent = [
      `::highlight(${this.names.match}) {`,
      "background-color: color-mix(in srgb, var(--primary) 35%, transparent);",
      "color: inherit;",
      "}",
      `::highlight(${this.names.active}) {`,
      "background-color: color-mix(in srgb, var(--primary) 75%, transparent);",
      "color: var(--primary-foreground);",
      "}",
    ].join("\n");
    document.head.append(style);
    this.styleElement = style;
  }
}

function getHighlights(): SupportedHighlightsAPI | null {
  if (typeof CSS === "undefined") return null;
  const registry = (CSS as { highlights?: SupportedHighlightsAPI }).highlights;
  return registry ?? null;
}

function collectTextRanges(input: {
  readonly root: HTMLElement;
  readonly query: string;
  readonly matchCase: boolean;
  readonly activeMatchIndex: number;
}): ReadonlyArray<Range> {
  const needle = input.matchCase ? input.query : input.query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(input.root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (parent === null) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIPPED_HIGHLIGHT_ANCESTOR_SELECTOR) !== null) {
        return NodeFilter.FILTER_REJECT;
      }
      const button = parent.closest("button");
      if (
        button !== null &&
        button.closest(INCLUDED_BUTTON_HIGHLIGHT_SELECTOR) === null
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode() as Text | null;
  while (node !== null) {
    const haystack = input.matchCase ? node.data : node.data.toLowerCase();
    const step = Math.max(input.query.length, 1);
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const range = new Range();
      range.setStart(node, index);
      range.setEnd(node, index + input.query.length);
      ranges.push(range);
      index = haystack.indexOf(needle, index + step);
    }
    node = walker.nextNode() as Text | null;
  }
  return ranges;
}

function stableCssIdentSuffix(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
