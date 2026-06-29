import "../../../../__tests__/test-browser-apis";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildChatFindRows,
  createChatFindAdapter,
  markdownToChatSearchText,
} from "@/components/chat/chat-find";
import type { JsonContent } from "@traycer/protocol/common/registry";
import type {
  ChatMessage as ChatMessageModel,
  MessageSegment,
} from "@/stores/composer/chat-store";
import { makeMessage } from "./chat-message-fixtures";

class TestHighlight {
  readonly ranges: ReadonlyArray<Range>;

  constructor(...ranges: ReadonlyArray<Range>) {
    this.ranges = ranges;
  }
}

interface MockHighlightRegistry {
  readonly values: ReadonlyMap<string, TestHighlight>;
  readonly setCalls: ReadonlyArray<string>;
}

let restoreHighlights: (() => void) | null = null;
let restoreFrames: (() => void) | null = null;

beforeEach(() => {
  restoreFrames = installFrameQueue();
});

afterEach(() => {
  restoreFrames?.();
  restoreFrames = null;
  restoreHighlights?.();
  restoreHighlights = null;
  vi.restoreAllMocks();
});

describe("chat find projection", () => {
  it("projects markdown links and code as rendered text, not markdown syntax", () => {
    const text = markdownToChatSearchText(
      [
        "Read [Traycer docs](https://example.test/docs) and `inlineCode`.",
        "",
        "```ts",
        "const answer = 42;",
        "```",
      ].join("\n"),
    );

    expect(text).toContain("Traycer docs");
    expect(text).toContain("inlineCode");
    expect(text).toContain("const answer = 42;");
    expect(text).not.toContain("https://example.test/docs");
    expect(text).not.toContain("```");
    expect(text).not.toContain("[Traycer docs]");
  });

  it("indexes user structured text, assistant prose, and excludes next-step controls", () => {
    const structuredContent: JsonContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "slashCommand", attrs: { commandName: "fix" } },
            { type: "text", text: " search bar alignment" },
          ],
        },
      ],
    };
    const user: ChatMessageModel = {
      ...makeMessage(1, "user"),
      content: "",
      structuredContent,
    };
    const assistant: ChatMessageModel = {
      ...makeMessage(2, "assistant"),
      segments: [
        {
          id: "assistant-text",
          kind: "text",
          markdown: [
            "Visible assistant answer.",
            "",
            "<TRAYCER_NEXT_STEPS>",
            "Choose one of these next steps.",
            "",
            "- [] : Hidden button prompt",
            "</TRAYCER_NEXT_STEPS>",
          ].join("\n"),
          isStreaming: false,
        },
      ],
    };

    const rows = buildChatFindRows([user, assistant]);
    const joined = rows.map((row) => row.searchableText).join("\n");

    expect(joined).toContain("/fix search bar alignment");
    expect(joined).toContain("Visible assistant answer.");
    expect(joined).toContain("Choose one of these next steps.");
    expect(joined).not.toContain("Hidden button prompt");
    expect(joined).not.toContain("Show more");
    expect(joined).not.toContain("Copy reply");
  });

  it("indexes collapsed activity group summaries without hidden child details", () => {
    const segments: ReadonlyArray<MessageSegment> = [
      {
        id: "tool-1",
        kind: "tool",
        toolName: "read_file",
        inputSummary: "src/components/search-bar.tsx",
        inputDetail: null,
        taskTodoItems: null,
        error: null,
        agentMessageSend: null,
        isStreaming: false,
        endState: null,
        progress: null,
        startedAt: 0,
        parentId: null,
      },
      {
        id: "file-1",
        kind: "file_change",
        filePath: "src/components/chat/chat-find.ts",
        operation: "create",
        diffSource: "snapshot",
        beforeHash: null,
        afterHash: "after",
        additions: 12,
        deletions: 0,
        sourceBlockIds: ["file-1"],
        reason: "snapshot",
        isStreaming: false,
        endState: null,
        parentId: null,
      },
    ];
    const assistant: ChatMessageModel = {
      ...makeMessage(3, "assistant"),
      segments,
    };

    const row = buildChatFindRows([assistant])[0];

    expect(row.searchableText).toContain("Read 1 file, edited 1 file");
    expect(row.searchableText).not.toContain("src/components/search-bar.tsx");
    expect(row.searchableText).not.toContain(
      "src/components/chat/chat-find.ts",
    );
  });

  it("does not index completed reasoning body text hidden behind the collapsed summary", () => {
    const assistant: ChatMessageModel = {
      ...makeMessage(4, "assistant"),
      segments: [
        {
          id: "reasoning-1",
          kind: "reasoning",
          markdown: "private chain of thought details",
          isStreaming: false,
          durationMs: 2100,
        },
      ],
    };

    const row = buildChatFindRows([assistant])[0];

    expect(row.searchableText).toContain("Thought for 2s");
    expect(row.searchableText).not.toContain("private chain of thought");
  });
});

describe("chat find adapter", () => {
  it("counts projection matches and reports pending when the row is not mounted", () => {
    const scrollToMessage = vi.fn();
    const adapter = createChatFindAdapter({
      tileInstanceId: "chat-tile-a",
      scrollToMessage,
      getMountedMessageRoot: () => null,
    });
    adapter.updateRows([
      { messageId: "row-1", searchableText: "alpha beta alpha" },
      { messageId: "row-2", searchableText: "gamma" },
    ]);

    void adapter.search({ requestId: 1, query: "alpha", matchCase: false });

    expect(adapter.getSnapshot()).toMatchObject({
      requestId: 1,
      status: "ready",
      current: 1,
      total: 2,
      activeUnitId: "row-1",
      exactHighlight: "pending",
    });
    expect(scrollToMessage).toHaveBeenCalledWith("row-1");
  });

  it("scrolls to an offscreen match and paints after the row mounts", () => {
    const registry = installMockHighlights();
    const mountedRows = new Map<string, HTMLElement>();
    const adapter = createChatFindAdapter({
      tileInstanceId: "chat-tile-b",
      scrollToMessage: vi.fn(),
      getMountedMessageRoot: (messageId) => mountedRows.get(messageId) ?? null,
    });
    adapter.updateRows([
      { messageId: "visible-row", searchableText: "ordinary text" },
      { messageId: "offscreen-row", searchableText: "needle text" },
    ]);

    void adapter.search({ requestId: 2, query: "needle", matchCase: false });
    flushFrames();
    expect(adapter.getSnapshot().exactHighlight).toBe("pending");

    const row = document.createElement("div");
    row.dataset.messageId = "offscreen-row";
    row.textContent = "needle text";
    mountedRows.set("offscreen-row", row);
    adapter.syncMountedHighlight();
    flushFrames();

    expect(adapter.getSnapshot().exactHighlight).toBe("painted");
    const activeEntry = Array.from(registry.values.entries()).find(([name]) =>
      name.includes("active"),
    );
    expect(activeEntry).not.toBeUndefined();
    const activeRange = activeEntry?.[1].ranges[0];
    expect(activeRange?.startContainer.parentElement).toBe(row);
  });

  it("paints visible content-bearing header text inside buttons", () => {
    const registry = installMockHighlights();
    const row = document.createElement("div");
    const trigger = document.createElement("button");
    trigger.dataset.findInclude = "true";
    const label = document.createElement("span");
    label.textContent = "Ran 1 command";
    trigger.append(label);
    const control = document.createElement("button");
    control.textContent = "Copy reply";
    row.append(trigger);
    row.append(control);
    const adapter = createChatFindAdapter({
      tileInstanceId: "chat-tile-header",
      scrollToMessage: vi.fn(),
      getMountedMessageRoot: () => row,
    });
    adapter.updateRows([
      { messageId: "row-1", searchableText: "Ran 1 command" },
    ]);

    void adapter.search({ requestId: 3, query: "Ran", matchCase: false });
    flushFrames();

    expect(adapter.getSnapshot().exactHighlight).toBe("painted");
    const activeEntry = Array.from(registry.values.entries()).find(([name]) =>
      name.includes("active"),
    );
    expect(activeEntry).not.toBeUndefined();
    const activeRange = activeEntry?.[1].ranges[0];
    expect(activeRange?.startContainer.parentElement).toBe(label);

    adapter.updateRows([
      { messageId: "row-1", searchableText: "Ran 1 command Copy reply" },
    ]);
    void adapter.search({
      requestId: 4,
      query: "Copy reply",
      matchCase: false,
    });
    flushFrames();

    expect(adapter.getSnapshot().exactHighlight).toBe("pending");
  });

  it("prevents stale highlight work from overwriting a newer query", () => {
    installMockHighlights();
    const row = document.createElement("div");
    row.textContent = "old newer";
    const adapter = createChatFindAdapter({
      tileInstanceId: "chat-tile-c",
      scrollToMessage: vi.fn(),
      getMountedMessageRoot: () => row,
    });
    adapter.updateRows([{ messageId: "row-1", searchableText: "old newer" }]);

    void adapter.search({ requestId: 1, query: "old", matchCase: false });
    expect(adapter.getSnapshot().exactHighlight).toBe("pending");
    void adapter.search({ requestId: 2, query: "missing", matchCase: false });
    expect(adapter.getSnapshot()).toMatchObject({
      requestId: 2,
      query: "missing",
      total: 0,
      exactHighlight: "none",
    });
    flushFrames();

    expect(adapter.getSnapshot()).toMatchObject({
      requestId: 2,
      query: "missing",
      total: 0,
      exactHighlight: "none",
    });
  });
});

function installMockHighlights(): MockHighlightRegistry {
  const globalWithHighlights: {
    readonly CSS?: typeof CSS;
    readonly Highlight?: typeof Highlight;
  } = globalThis;
  const previousCss = globalWithHighlights.CSS;
  const previousHighlight = globalWithHighlights.Highlight;
  const values = new Map<string, TestHighlight>();
  const setCalls: string[] = [];
  Object.defineProperty(globalThis, "Highlight", {
    configurable: true,
    writable: true,
    value: TestHighlight,
  });
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    writable: true,
    value: {
      highlights: {
        set: (name: string, highlight: TestHighlight) => {
          setCalls.push(name);
          values.set(name, highlight);
        },
        delete: (name: string) => {
          values.delete(name);
        },
      },
    },
  });
  restoreHighlights = () => {
    if (previousCss === undefined) Reflect.deleteProperty(globalThis, "CSS");
    else {
      Object.defineProperty(globalThis, "CSS", {
        configurable: true,
        writable: true,
        value: previousCss,
      });
    }
    if (previousHighlight === undefined) {
      Reflect.deleteProperty(globalThis, "Highlight");
    } else {
      Object.defineProperty(globalThis, "Highlight", {
        configurable: true,
        writable: true,
        value: previousHighlight,
      });
    }
  };
  return { values, setCalls };
}

function installFrameQueue(): () => void {
  const frames: FrameRequestCallback[] = [];
  const request = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const cancel = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => {
      const index = id - 1;
      frames[index] = () => undefined;
    });
  flushFrames = () => {
    const pending = frames.splice(0, frames.length);
    pending.forEach((callback) => callback(performance.now()));
  };
  return () => {
    request.mockRestore();
    cancel.mockRestore();
    flushFrames = () => undefined;
  };
}

let flushFrames: () => void = () => undefined;
