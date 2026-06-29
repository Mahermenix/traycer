import "../../../../../__tests__/test-browser-apis";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { TileFindBar } from "@/components/epic-canvas/tile-find/tile-find-bar";
import {
  useTileFindStore,
  type TileFindAdapter,
  type TileFindCapability,
  type TileFindInput,
  type TileFindStateSnapshot,
  type TileFindStatus,
  type TileReplaceInput,
} from "@/stores/tile-find";
import type { TileKindId } from "@/stores/epics/canvas/tile-kinds";

const FIND_ONLY = new Set<TileFindCapability>(["find"]);
const REPLACE = new Set<TileFindCapability>(["find", "replace"]);
const REPLACE_ALL = new Set<TileFindCapability>([
  "find",
  "replace",
  "replaceAll",
]);

interface TestAdapter extends TileFindAdapter {
  readonly searchInputs: TileFindInput[];
  readonly replaceInputs: TileReplaceInput[];
  readonly nextMock: Mock<() => void>;
  readonly previousMock: Mock<() => void>;
  publish(snapshot: TileFindStateSnapshot): void;
}

function makeSnapshot(args: {
  readonly requestId: number;
  readonly status: TileFindStatus;
  readonly capabilities: ReadonlySet<TileFindCapability>;
  readonly query: string;
  readonly matchCase: boolean;
  readonly replaceText: string;
  readonly current: number;
  readonly total: number;
  readonly coverageMessage: string | null;
  readonly errorMessage: string | null;
}): TileFindStateSnapshot {
  return {
    requestId: args.requestId,
    status: args.status,
    capabilities: args.capabilities,
    query: args.query,
    matchCase: args.matchCase,
    replaceText: args.replaceText,
    current: args.current,
    total: args.total,
    coverageMessage: args.coverageMessage,
    errorMessage: args.errorMessage,
    activeUnitId: null,
    exactHighlight: "none",
  };
}

function createAdapter(args: {
  readonly tileInstanceId: string;
  readonly tileKind: TileKindId;
  readonly capabilities: ReadonlySet<TileFindCapability>;
}): TestAdapter {
  let snapshot = makeSnapshot({
    requestId: 0,
    status: "idle",
    capabilities: args.capabilities,
    query: "",
    matchCase: false,
    replaceText: "",
    current: 0,
    total: 0,
    coverageMessage: null,
    errorMessage: null,
  });
  const listeners = new Set<() => void>();
  const searchInputs: TileFindInput[] = [];
  const replaceInputs: TileReplaceInput[] = [];
  const nextMock = vi.fn();
  const previousMock = vi.fn();
  const publish = (next: TileFindStateSnapshot): void => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  return {
    tileInstanceId: args.tileInstanceId,
    tileKind: args.tileKind,
    searchInputs,
    replaceInputs,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    search: (input) => {
      searchInputs.push(input);
    },
    next: nextMock,
    previous: previousMock,
    clear: vi.fn(),
    replaceCurrent: (input) => {
      replaceInputs.push(input);
    },
    replaceAll: (input) => {
      replaceInputs.push(input);
    },
    nextMock,
    previousMock,
    publish,
  };
}

function registerAndOpen(adapter: TestAdapter): void {
  useTileFindStore.getState().registerTarget({
    tileInstanceId: adapter.tileInstanceId,
    contentId: "content-1",
    viewTabId: "view-1",
    tileId: "pane-1",
    epicId: "epic-1",
    tileKind: adapter.tileKind,
    isEligible: true,
    adapter,
  });
  useTileFindStore.getState().openForTile(adapter.tileInstanceId);
}

describe("<TileFindBar />", () => {
  afterEach(() => {
    cleanup();
    useTileFindStore.getState().resetForTests();
  });

  it("renders searching, ready, partial, unavailable, error, and no-match states", () => {
    const adapter = createAdapter({
      tileInstanceId: "tile-1",
      tileKind: "spec",
      capabilities: FIND_ONLY,
    });
    registerAndOpen(adapter);
    useTileFindStore.getState().setQuery("tile-1", "needle");
    render(<TileFindBar tileInstanceId="tile-1" />);

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "searching",
          capabilities: FIND_ONLY,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 0,
          total: 0,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByText("Searching")).toBeTruthy();

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "ready",
          capabilities: FIND_ONLY,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 1,
          total: 3,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "ready",
          capabilities: FIND_ONLY,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 0,
          total: 0,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByText("No matches")).toBeTruthy();

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "partial",
          capabilities: FIND_ONLY,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 2,
          total: 5,
          coverageMessage: "Some files are not loaded.",
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByText("2 of 5 partial")).toBeTruthy();

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "unavailable",
          capabilities: new Set<TileFindCapability>(),
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 0,
          total: 0,
          coverageMessage: "Not available",
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByText("Not available")).toBeTruthy();

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "error",
          capabilities: FIND_ONLY,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 0,
          total: 0,
          coverageMessage: null,
          errorMessage: "Search failed",
        }),
      );
    });
    expect(screen.getByText("Search failed")).toBeTruthy();
  });

  it("shows replace controls only when adapter capabilities allow them", () => {
    const adapter = createAdapter({
      tileInstanceId: "tile-1",
      tileKind: "ticket",
      capabilities: FIND_ONLY,
    });
    registerAndOpen(adapter);
    render(<TileFindBar tileInstanceId="tile-1" />);

    expect(screen.queryByLabelText("Replace with")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Find in tile" }), {
      target: { value: "needle" },
    });

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "ready",
          capabilities: REPLACE,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 1,
          total: 1,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
    });
    expect(screen.getByLabelText("Replace with")).toBeTruthy();
    expect(screen.getByLabelText("Replace current match")).toBeTruthy();
    expect(buttonDisabled("Replace all matches")).toBe(true);

    act(() => {
      adapter.publish(
        makeSnapshot({
          requestId: 1,
          status: "ready",
          capabilities: REPLACE_ALL,
          query: "needle",
          matchCase: false,
          replaceText: "",
          current: 1,
          total: 1,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
    });
    expect(buttonDisabled("Replace all matches")).toBe(false);
  });

  it("updates input state and dispatches search/navigation commands", () => {
    const adapter = createAdapter({
      tileInstanceId: "tile-1",
      tileKind: "review",
      capabilities: FIND_ONLY,
    });
    registerAndOpen(adapter);
    render(<TileFindBar tileInstanceId="tile-1" />);

    const input = screen.getByRole("textbox", { name: "Find in tile" });
    fireEvent.change(input, {
      target: { value: "needle" },
    });

    expect(adapter.searchInputs.at(-1)).toEqual({
      requestId: 1,
      query: "needle",
      matchCase: false,
    });

    fireEvent.click(screen.getByLabelText("Match case"));
    expect(adapter.searchInputs.at(-1)).toEqual({
      requestId: 2,
      query: "needle",
      matchCase: true,
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(adapter.nextMock.mock.calls).toHaveLength(1);

    fireEvent.keyDown(input, {
      key: "Enter",
      shiftKey: true,
    });
    expect(adapter.previousMock.mock.calls).toHaveLength(1);
  });
});

function buttonDisabled(label: string): boolean {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Expected ${label} to resolve to a button`);
  }
  return element.disabled;
}
