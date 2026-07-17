import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { basePersistOptions, persistKey, STORE_KEYS } from "@/lib/persist";

/**
 * The PR row remembered as expanded for an epic, across sessions. Persisted
 * ONLY for fully identified rows (a PR whose base coordinates are known) -
 * an unknown-base (list-only) row's expansion is transient component state,
 * never written here, per the wire contract's unknown-base rule: identity
 * must never appear to "silently change" if a later probe supplies the base
 * repo.
 */
export interface PrPanelExpandedRow {
  readonly hostId: string;
  readonly githubHost: string;
  readonly owner: string;
  readonly repo: string;
  readonly prNumber: number;
}

export interface PrPanelEpicState {
  readonly expandedPr: PrPanelExpandedRow | null;
}

export interface PrPanelStore {
  readonly stateByEpicId: Record<string, PrPanelEpicState>;
  readonly setExpandedPr: (
    epicId: string,
    row: PrPanelExpandedRow | null,
  ) => void;
}

export const defaultPrPanelEpicState: PrPanelEpicState = {
  expandedPr: null,
};

export const PR_PANEL_PERSIST_KEY = persistKey(STORE_KEYS.prPanel);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePersistedExpandedPr(value: unknown): PrPanelExpandedRow | null {
  if (!isRecord(value)) return null;
  const { hostId, githubHost, owner, repo, prNumber } = value;
  if (
    typeof hostId === "string" &&
    typeof githubHost === "string" &&
    typeof owner === "string" &&
    typeof repo === "string" &&
    typeof prNumber === "number"
  ) {
    return { hostId, githubHost, owner, repo, prNumber };
  }
  return null;
}

function migratePersistedEpicState(value: unknown): PrPanelEpicState {
  if (!isRecord(value)) return defaultPrPanelEpicState;
  return {
    expandedPr: parsePersistedExpandedPr(value.expandedPr),
  };
}

interface PrPanelPersistedState {
  readonly stateByEpicId: Record<string, PrPanelEpicState>;
}

export function migratePrPanelPersistedState(
  persisted: unknown,
): PrPanelPersistedState {
  if (!isRecord(persisted) || !isRecord(persisted.stateByEpicId)) {
    return { stateByEpicId: {} };
  }
  return {
    stateByEpicId: Object.fromEntries(
      Object.entries(persisted.stateByEpicId).map(([epicId, value]) => [
        epicId,
        migratePersistedEpicState(value),
      ]),
    ),
  };
}

export function expandedRowsEqual(
  left: PrPanelExpandedRow | null,
  right: PrPanelExpandedRow | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.hostId === right.hostId &&
    left.githubHost === right.githubHost &&
    left.owner === right.owner &&
    left.repo === right.repo &&
    left.prNumber === right.prNumber
  );
}

export const usePrPanelStore = create<PrPanelStore>()(
  persist(
    (set) => ({
      stateByEpicId: {},

      setExpandedPr: (epicId, row) => {
        set((state) => {
          const current =
            state.stateByEpicId[epicId] ?? defaultPrPanelEpicState;
          if (expandedRowsEqual(current.expandedPr, row)) {
            return state;
          }
          return {
            stateByEpicId: {
              ...state.stateByEpicId,
              [epicId]: { ...current, expandedPr: row },
            },
          };
        });
      },
    }),
    {
      ...basePersistOptions(PR_PANEL_PERSIST_KEY),
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        stateByEpicId: Object.entries(state.stateByEpicId).reduce<
          Record<string, unknown>
        >((acc, [epicId, epicState]) => {
          acc[epicId] = { expandedPr: epicState.expandedPr };
          return acc;
        }, {}),
      }),
      migrate: (persisted) => migratePrPanelPersistedState(persisted),
    },
  ),
);

export function selectPrPanelEpicState(epicId: string) {
  return (s: PrPanelStore): PrPanelEpicState => ({
    ...defaultPrPanelEpicState,
    ...s.stateByEpicId[epicId],
  });
}

/** True once the epic has any expansion entry (including an explicit null after first open / user collapse). */
export function selectHasPrPanelEpicState(epicId: string) {
  return (s: PrPanelStore): boolean => Object.hasOwn(s.stateByEpicId, epicId);
}
