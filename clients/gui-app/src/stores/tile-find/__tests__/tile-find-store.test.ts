import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createUnavailableTileFindAdapter,
  useTileFindStore,
  type TileFindAdapter,
  type TileFindCapability,
  type TileFindInput,
  type TileFindStateSnapshot,
  type TileFindStatus,
  type TileReplaceInput,
} from "@/stores/tile-find";
import type { TileKindId } from "@/stores/epics/canvas/tile-kinds";

const FIND_CAPABILITY = new Set<TileFindCapability>(["find"]);
const REPLACE_CAPABILITY = new Set<TileFindCapability>([
  "find",
  "replace",
  "replaceAll",
]);

interface TestTileFindAdapter extends TileFindAdapter {
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

function createTestAdapter(args: {
  readonly tileInstanceId: string;
  readonly tileKind: TileKindId;
  readonly capabilities: ReadonlySet<TileFindCapability>;
}): TestTileFindAdapter {
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
      publish(
        makeSnapshot({
          requestId: input.requestId,
          status: "searching",
          capabilities: args.capabilities,
          query: input.query,
          matchCase: input.matchCase,
          replaceText: snapshot.replaceText,
          current: 0,
          total: 0,
          coverageMessage: null,
          errorMessage: null,
        }),
      );
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

function register(adapter: TileFindAdapter, isEligible: boolean): () => void {
  return useTileFindStore.getState().registerTarget({
    tileInstanceId: adapter.tileInstanceId,
    contentId: `${adapter.tileInstanceId}-content`,
    viewTabId: "view-1",
    tileId: `${adapter.tileInstanceId}-pane`,
    epicId: "epic-1",
    tileKind: adapter.tileKind,
    isEligible,
    adapter,
  });
}

describe("useTileFindStore", () => {
  afterEach(() => {
    useTileFindStore.getState().resetForTests();
  });

  it("advances request ids and rejects stale adapter snapshots", () => {
    const adapter = createTestAdapter({
      tileInstanceId: "tile-a",
      tileKind: "spec",
      capabilities: FIND_CAPABILITY,
    });
    register(adapter, true);

    useTileFindStore.getState().setQuery("tile-a", "needle");
    useTileFindStore.getState().search("tile-a");

    expect(adapter.searchInputs).toEqual([
      { requestId: 1, query: "needle", matchCase: false },
    ]);
    expect(
      useTileFindStore.getState().uiByTileInstanceId["tile-a"]?.lastSnapshot
        .status,
    ).toBe("searching");

    adapter.publish(
      makeSnapshot({
        requestId: 0,
        status: "ready",
        capabilities: FIND_CAPABILITY,
        query: "needle",
        matchCase: false,
        replaceText: "",
        current: 1,
        total: 1,
        coverageMessage: null,
        errorMessage: null,
      }),
    );

    expect(
      useTileFindStore.getState().uiByTileInstanceId["tile-a"]?.lastSnapshot
        .status,
    ).toBe("searching");

    adapter.publish(
      makeSnapshot({
        requestId: 1,
        status: "ready",
        capabilities: FIND_CAPABILITY,
        query: "needle",
        matchCase: false,
        replaceText: "",
        current: 1,
        total: 2,
        coverageMessage: null,
        errorMessage: null,
      }),
    );

    expect(
      useTileFindStore.getState().uiByTileInstanceId["tile-a"]?.lastSnapshot
        .total,
    ).toBe(2);

    useTileFindStore.getState().setQuery("tile-a", "next");
    useTileFindStore.getState().search("tile-a");

    expect(adapter.searchInputs.at(-1)).toEqual({
      requestId: 2,
      query: "next",
      matchCase: false,
    });
  });

  it("keeps the current adapter subscription when an old unregister cleanup runs", () => {
    const firstAdapter = createTestAdapter({
      tileInstanceId: "tile-a",
      tileKind: "spec",
      capabilities: FIND_CAPABILITY,
    });
    const secondAdapter = createTestAdapter({
      tileInstanceId: "tile-a",
      tileKind: "spec",
      capabilities: FIND_CAPABILITY,
    });
    const unregisterFirst = register(firstAdapter, true);
    register(secondAdapter, true);

    unregisterFirst();

    expect(
      useTileFindStore.getState().targetsByTileInstanceId["tile-a"]?.adapter,
    ).toBe(secondAdapter);

    secondAdapter.publish(
      makeSnapshot({
        requestId: 0,
        status: "ready",
        capabilities: FIND_CAPABILITY,
        query: "",
        matchCase: false,
        replaceText: "",
        current: 1,
        total: 4,
        coverageMessage: null,
        errorMessage: null,
      }),
    );

    expect(
      useTileFindStore.getState().uiByTileInstanceId["tile-a"]?.lastSnapshot
        .total,
    ).toBe(4);
  });

  it("replays the current search request when a tile adapter is replaced", () => {
    const loadingAdapter = createTestAdapter({
      tileInstanceId: "tile-a",
      tileKind: "spec",
      capabilities: FIND_CAPABILITY,
    });
    const loadedAdapter = createTestAdapter({
      tileInstanceId: "tile-a",
      tileKind: "spec",
      capabilities: FIND_CAPABILITY,
    });
    register(loadingAdapter, true);

    useTileFindStore.getState().setMatchCase("tile-a", true);
    useTileFindStore.getState().setQuery("tile-a", "Needle");
    useTileFindStore.getState().search("tile-a");
    register(loadedAdapter, true);

    expect(loadingAdapter.searchInputs).toEqual([
      { requestId: 1, query: "Needle", matchCase: true },
    ]);
    expect(loadedAdapter.searchInputs).toEqual([
      { requestId: 1, query: "Needle", matchCase: true },
    ]);
    expect(
      useTileFindStore.getState().uiByTileInstanceId["tile-a"]
        ?.currentRequestId,
    ).toBe(1);
  });

  it("ignores stale async command failures from earlier requests", async () => {
    let snapshot = makeSnapshot({
      requestId: 0,
      status: "idle",
      capabilities: FIND_CAPABILITY,
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
    const rejectSearches: Array<(reason: unknown) => void> = [];
    const nextMock = vi.fn();
    const previousMock = vi.fn();
    const adapter: TestTileFindAdapter = {
      tileInstanceId: "tile-a",
      tileKind: "spec",
      searchInputs,
      replaceInputs: [],
      nextMock,
      previousMock,
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      search: (input) => {
        searchInputs.push(input);
        return new Promise<void>((_resolve, reject) => {
          rejectSearches.push(reject);
        });
      },
      next: nextMock,
      previous: previousMock,
      clear: vi.fn(),
      replaceCurrent: vi.fn(),
      replaceAll: vi.fn(),
      publish: (next) => {
        snapshot = next;
        listeners.forEach((listener) => listener());
      },
    };
    register(adapter, true);

    useTileFindStore.getState().setQuery("tile-a", "first");
    useTileFindStore.getState().search("tile-a");
    useTileFindStore.getState().setQuery("tile-a", "second");
    useTileFindStore.getState().search("tile-a");

    expect(searchInputs).toEqual([
      { requestId: 1, query: "first", matchCase: false },
      { requestId: 2, query: "second", matchCase: false },
    ]);

    rejectSearches[0]?.(new Error("first failed"));
    await Promise.resolve();

    const afterStaleFailure =
      useTileFindStore.getState().uiByTileInstanceId["tile-a"];
    expect(afterStaleFailure?.currentRequestId).toBe(2);
    expect(afterStaleFailure?.lastSnapshot.status).toBe("searching");
    expect(afterStaleFailure?.lastSnapshot.errorMessage).toBeNull();

    rejectSearches[1]?.(new Error("second failed"));
    await Promise.resolve();

    const afterCurrentFailure =
      useTileFindStore.getState().uiByTileInstanceId["tile-a"];
    expect(afterCurrentFailure?.currentRequestId).toBe(2);
    expect(afterCurrentFailure?.lastSnapshot.status).toBe("error");
    expect(afterCurrentFailure?.lastSnapshot.errorMessage).toBe(
      "second failed",
    );
  });

  it("keeps query and open state isolated per tile instance", () => {
    register(
      createTestAdapter({
        tileInstanceId: "tile-a",
        tileKind: "spec",
        capabilities: FIND_CAPABILITY,
      }),
      true,
    );
    register(
      createTestAdapter({
        tileInstanceId: "tile-b",
        tileKind: "spec",
        capabilities: REPLACE_CAPABILITY,
      }),
      false,
    );

    useTileFindStore.getState().setQuery("tile-a", "alpha");
    useTileFindStore.getState().setQuery("tile-b", "beta");
    useTileFindStore.getState().setReplaceText("tile-b", "gamma");
    useTileFindStore.getState().openForTile("tile-a");

    const state = useTileFindStore.getState();
    expect(state.uiByTileInstanceId["tile-a"]?.query).toBe("alpha");
    expect(state.uiByTileInstanceId["tile-a"]?.isOpen).toBe(true);
    expect(state.uiByTileInstanceId["tile-b"]?.query).toBe("beta");
    expect(state.uiByTileInstanceId["tile-b"]?.replaceText).toBe("gamma");
    expect(state.uiByTileInstanceId["tile-b"]?.isOpen).toBe(false);
  });

  it("registers blank or unsupported tiles with the default unavailable state", () => {
    const adapter = createUnavailableTileFindAdapter({
      tileInstanceId: "blank-tile",
      tileKind: "blank",
      message: null,
    });
    register(adapter, true);

    useTileFindStore.getState().openForTile("blank-tile");
    useTileFindStore.getState().setQuery("blank-tile", "needle");
    useTileFindStore.getState().search("blank-tile");

    const snapshot =
      useTileFindStore.getState().uiByTileInstanceId["blank-tile"]
        ?.lastSnapshot;
    expect(snapshot?.status).toBe("unavailable");
    expect(snapshot?.capabilities.size).toBe(0);
    expect(snapshot?.coverageMessage).toBe("Open a tile before using find.");
    expect(snapshot?.requestId).toBe(1);
  });

  it("resolves active owner only for eligible tiles and owner-free canvas state", () => {
    register(
      createTestAdapter({
        tileInstanceId: "hidden",
        tileKind: "chat",
        capabilities: FIND_CAPABILITY,
      }),
      false,
    );
    register(
      createTestAdapter({
        tileInstanceId: "active",
        tileKind: "ticket",
        capabilities: FIND_CAPABILITY,
      }),
      true,
    );

    expect(useTileFindStore.getState().activeOwner).toMatchObject({
      tileInstanceId: "active",
      tileKind: "ticket",
    });

    useTileFindStore.getState().setOwnerBlocker({
      reason: "command-palette",
      ownerId: "command-palette",
    });

    expect(useTileFindStore.getState().activeOwner).toBeNull();

    useTileFindStore.getState().setOwnerBlocker(null);

    expect(useTileFindStore.getState().activeOwner?.tileInstanceId).toBe(
      "active",
    );
  });

  it("advances the resolved active owner without duplicating owner resolution", () => {
    const activeAdapter = createTestAdapter({
      tileInstanceId: "active",
      tileKind: "ticket",
      capabilities: FIND_CAPABILITY,
    });
    const hiddenAdapter = createTestAdapter({
      tileInstanceId: "hidden",
      tileKind: "chat",
      capabilities: FIND_CAPABILITY,
    });
    register(activeAdapter, true);
    register(hiddenAdapter, false);

    expect(useTileFindStore.getState().advanceActiveOwner(1)).toBe(true);
    expect(useTileFindStore.getState().advanceActiveOwner(-1)).toBe(true);

    expect(activeAdapter.nextMock.mock.calls).toHaveLength(1);
    expect(activeAdapter.previousMock.mock.calls).toHaveLength(1);
    expect(hiddenAdapter.nextMock.mock.calls).toHaveLength(0);
    expect(hiddenAdapter.previousMock.mock.calls).toHaveLength(0);

    useTileFindStore.getState().setOwnerBlocker({
      reason: "app-dialog",
      ownerId: "app-dialog",
    });

    expect(useTileFindStore.getState().advanceActiveOwner(1)).toBe(false);
    expect(activeAdapter.nextMock.mock.calls).toHaveLength(1);
  });
});
