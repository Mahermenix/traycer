import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import {
  applyArtifactFindSearch,
  calculateArtifactFindMatches,
  clearArtifactFind,
  findNearestArtifactFindMatchIndex,
  getArtifactFindState,
  hasArtifactFindTransactionMeta,
  setArtifactFindCurrent,
  setArtifactFindSearchMeta,
} from "@/editor-core";
import type { TileKindId } from "@/stores/epics/canvas/tile-kinds";
import type {
  TileFindAdapter,
  TileFindCapability,
  TileFindExactHighlight,
  TileFindInput,
  TileFindStateSnapshot,
  TileFindStatus,
  TileReplaceInput,
} from "@/stores/tile-find";

interface ArtifactEditorFindAdapterParams {
  readonly editor: Editor;
  readonly tileInstanceId: string;
  readonly tileKind: TileKindId;
  readonly activeUnitId: string;
}

const FIND_ONLY_CAPABILITIES: ReadonlySet<TileFindCapability> =
  new Set<TileFindCapability>(["find"]);
const REPLACE_CAPABILITIES: ReadonlySet<TileFindCapability> =
  new Set<TileFindCapability>(["find", "replace", "replaceAll"]);
const ARTIFACT_FIND_RESCAN_DEBOUNCE_MS = 80;

export function createArtifactEditorFindAdapter(
  params: ArtifactEditorFindAdapterParams,
): TileFindAdapter {
  const { editor, tileInstanceId, tileKind, activeUnitId } = params;
  const listeners = new Set<() => void>();
  let snapshot = snapshotFromEditor(editor, activeUnitId, "");
  let replaceText = "";
  let unsubscribeEditor: (() => void) | null = null;
  let rescanTimer: number | null = null;

  const publish = (): void => {
    snapshot = snapshotFromEditor(editor, activeUnitId, replaceText);
    listeners.forEach((listener) => listener());
  };

  const cancelRescan = (): void => {
    if (rescanTimer === null) return;
    window.clearTimeout(rescanTimer);
    rescanTimer = null;
  };

  const scheduleRescan = (): void => {
    const state = getArtifactFindState(editor);
    if (state.query.length === 0) {
      publish();
      return;
    }
    cancelRescan();
    publish();
    rescanTimer = window.setTimeout(() => {
      rescanTimer = null;
      const current = getArtifactFindState(editor);
      if (current.query.length === 0) {
        publish();
        return;
      }
      const currentMatch = artifactFindMatchAt(
        current.matches,
        current.currentIndex,
      );
      applyArtifactFindSearch(
        editor,
        {
          requestId: current.requestId,
          query: current.query,
          matchCase: current.matchCase,
        },
        currentMatch === null ? null : currentMatch.from,
      );
      publish();
    }, ARTIFACT_FIND_RESCAN_DEBOUNCE_MS);
  };

  const handleTransaction = (props: { readonly transaction: Transaction }) => {
    if (
      props.transaction.docChanged &&
      !hasArtifactFindTransactionMeta(props.transaction)
    ) {
      scheduleRescan();
      return;
    }
    publish();
  };

  const attachEditorListener = (): void => {
    if (unsubscribeEditor !== null) return;
    editor.on("transaction", handleTransaction);
    unsubscribeEditor = () => {
      editor.off("transaction", handleTransaction);
    };
  };

  const detachEditorListener = (): void => {
    cancelRescan();
    unsubscribeEditor?.();
    unsubscribeEditor = null;
  };

  const dispatchReplaceCurrent = (input: TileReplaceInput): void => {
    replaceText = input.replaceText;
    if (!editor.isEditable) {
      publish();
      return;
    }
    const current = getArtifactFindState(editor);
    const currentMatch = artifactFindMatchAt(
      current.matches,
      current.currentIndex,
    );
    const matches = calculateArtifactFindMatches(
      editor.state.doc,
      input.query,
      input.matchCase,
    );
    const index = findNearestArtifactFindMatchIndex(
      matches,
      currentMatch === null ? null : currentMatch.from,
    );
    const match = artifactFindMatchAt(matches, index);
    if (match === null) {
      applyArtifactFindSearch(editor, input, null);
      publish();
      return;
    }
    cancelRescan();
    const preferredPosition = match.from + input.replaceText.length;
    const tr = setArtifactFindSearchMeta(
      editor.state.tr.insertText(input.replaceText, match.from, match.to),
      input,
      preferredPosition,
    ).scrollIntoView();
    editor.view.dispatch(tr);
    publish();
  };

  const dispatchReplaceAll = (input: TileReplaceInput): void => {
    replaceText = input.replaceText;
    if (!editor.isEditable) {
      publish();
      return;
    }
    const matches = calculateArtifactFindMatches(
      editor.state.doc,
      input.query,
      input.matchCase,
    );
    if (matches.length === 0) {
      applyArtifactFindSearch(editor, input, null);
      publish();
      return;
    }
    cancelRescan();
    const preferredPosition = matches[0].from;
    const tr = matches
      .slice()
      .reverse()
      .reduce(
        (currentTransaction, match) =>
          currentTransaction.insertText(
            input.replaceText,
            match.from,
            match.to,
          ),
        editor.state.tr,
      );
    editor.view.dispatch(
      setArtifactFindSearchMeta(tr, input, preferredPosition).scrollIntoView(),
    );
    publish();
  };

  return {
    tileInstanceId,
    tileKind,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      attachEditorListener();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detachEditorListener();
      };
    },
    search: (input: TileFindInput) => {
      cancelRescan();
      applyArtifactFindSearch(editor, input, null);
      publish();
    },
    next: () => {
      const state = getArtifactFindState(editor);
      if (state.matches.length === 0) return;
      const nextIndex =
        state.currentIndex < 0
          ? 0
          : (state.currentIndex + 1) % state.matches.length;
      setArtifactFindCurrent(editor, nextIndex, true);
      publish();
    },
    previous: () => {
      const state = getArtifactFindState(editor);
      if (state.matches.length === 0) return;
      const previousIndex =
        state.currentIndex <= 0
          ? state.matches.length - 1
          : state.currentIndex - 1;
      setArtifactFindCurrent(editor, previousIndex, true);
      publish();
    },
    clear: () => {
      cancelRescan();
      clearArtifactFind(editor, snapshot.requestId);
      publish();
    },
    replaceCurrent: dispatchReplaceCurrent,
    replaceAll: dispatchReplaceAll,
  };
}

function snapshotFromEditor(
  editor: Editor,
  activeUnitId: string,
  replaceText: string,
): TileFindStateSnapshot {
  const state = getArtifactFindState(editor);
  const total = state.matches.length;
  return {
    requestId: state.requestId,
    status: artifactSnapshotStatus(state.query, state.pending),
    capabilities: editor.isEditable
      ? REPLACE_CAPABILITIES
      : FIND_ONLY_CAPABILITIES,
    query: state.query,
    matchCase: state.matchCase,
    replaceText,
    current: total === 0 ? 0 : state.currentIndex + 1,
    total,
    coverageMessage: null,
    errorMessage: null,
    activeUnitId: total === 0 ? null : activeUnitId,
    exactHighlight: artifactExactHighlight(total, state.pending),
  };
}

function artifactFindMatchAt(
  matches: ReadonlyArray<{ readonly from: number; readonly to: number }>,
  index: number,
): { readonly from: number; readonly to: number } | null {
  if (index < 0) return null;
  return matches.at(index) ?? null;
}

function artifactSnapshotStatus(
  query: string,
  pending: boolean,
): TileFindStatus {
  if (query.length === 0) return "idle";
  return pending ? "searching" : "ready";
}

function artifactExactHighlight(
  total: number,
  pending: boolean,
): TileFindExactHighlight {
  if (total === 0) return "none";
  return pending ? "pending" : "painted";
}
