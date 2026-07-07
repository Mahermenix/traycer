/**
 * Shared host+folder selection for terminal creation: host section, folder
 * list, and Launch action. Used by both the sidebar "+" popover
 * (`new-terminal-picker.tsx`) and the ⌘K palette's "Create new terminal"
 * dialog (`new-terminal-dialog.tsx`) so host+folder selection logic lives in
 * exactly one place (gui-app AGENTS.md's palette/manual-UI parity rule).
 *
 * Callers mount this only while their popover/dialog is open (and unmount it
 * on close), so its state - the explicit row pick and the launch latch -
 * starts fresh every time without needing an imperative reset.
 *
 * When the epic has no worktree folders bound at all, there is no row to
 * select from, but a terminal can still be launched "folderless" - bound to
 * the active host's default cwd (`terminal.defaultCwd`). `launchTarget`
 * unifies both paths so callers only ever handle one shape.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorktreeBindingSelectorRow } from "@traycer/protocol/host";
import { Button } from "@/components/ui/button";
import { WorktreeFolderListBody } from "@/components/worktree/worktree-folder-list-body";
import { WorktreePickerHostSection } from "@/components/worktree/worktree-picker-host-section";
import { useReactiveActiveHostId } from "@/hooks/host/use-reactive-active-host-id";
import { useTerminalDefaultCwd } from "@/hooks/terminal/use-terminal-default-cwd-query";
import { useWorktreeListBindingsForEpic } from "@/hooks/worktree/use-worktree-list-bindings-for-epic-query";
import { worktreeRowKey } from "@/lib/worktree/worktree-row-key";

export interface TerminalLaunchTarget {
  readonly hostId: string;
  readonly cwd: string;
}

export interface NewTerminalPickerBodyProps {
  readonly epicId: string;
  readonly onLaunch: (target: TerminalLaunchTarget) => void;
}

export function NewTerminalPickerBody(props: NewTerminalPickerBodyProps) {
  const { epicId, onLaunch } = props;
  const [explicitRow, setExplicitRow] =
    useState<WorktreeBindingSelectorRow | null>(null);
  const activeHostId = useReactiveActiveHostId();
  const bindingsQuery = useWorktreeListBindingsForEpic({
    epicId,
    enabled: true,
  });
  const rows = useMemo(
    () => bindingsQuery.data?.rows ?? [],
    [bindingsQuery.data?.rows],
  );
  const selectedRow = useMemo(
    () => resolveTerminalSelection(explicitRow, rows),
    [explicitRow, rows],
  );
  const hasLoadedNoRows =
    !bindingsQuery.isPending && !bindingsQuery.isError && rows.length === 0;
  const defaultCwdQuery = useTerminalDefaultCwd({
    epicId,
    enabled: hasLoadedNoRows,
  });
  const folderlessCwdPending = hasLoadedNoRows && defaultCwdQuery.isPending;
  const folderlessCwdFailed = hasLoadedNoRows && defaultCwdQuery.isError;
  const launchTarget = useMemo(
    () =>
      selectedRow === null
        ? resolveFolderlessTerminalTarget(
            hasLoadedNoRows && !folderlessCwdPending && !folderlessCwdFailed,
            activeHostId,
            defaultCwdQuery.data?.cwd,
          )
        : { hostId: selectedRow.hostId, cwd: selectedRow.runningDir },
    [
      activeHostId,
      defaultCwdQuery.data?.cwd,
      folderlessCwdFailed,
      folderlessCwdPending,
      hasLoadedNoRows,
      selectedRow,
    ],
  );

  // A double-click on Launch fires the handler twice before React can flush
  // the state update that unmounts this body, so each click would mint a
  // fresh terminal. This synchronous latch collapses one open->launch session
  // to a single terminal.
  const hasLaunchedRef = useRef(false);
  const handleLaunch = useCallback(() => {
    if (hasLaunchedRef.current || launchTarget === null) return;
    hasLaunchedRef.current = true;
    onLaunch(launchTarget);
  }, [launchTarget, onLaunch]);

  let folderlessCwdStatus: ReactNode = null;
  if (folderlessCwdPending) {
    folderlessCwdStatus = (
      <span data-testid="new-terminal-folderless-cwd-pending">
        Resolving terminal directory.
      </span>
    );
  } else if (folderlessCwdFailed) {
    folderlessCwdStatus = (
      <span
        className="text-destructive"
        data-testid="new-terminal-folderless-cwd-error"
      >
        Couldn't resolve terminal directory.
      </span>
    );
  }

  return (
    <>
      <WorktreePickerHostSection />
      <WorktreeFolderListBody
        isPending={bindingsQuery.isPending}
        isError={bindingsQuery.isError}
        rows={rows}
        selectedRow={selectedRow}
        secondaryLabel={(row) => row.runningDir}
        onSelect={setExplicitRow}
        autoFocusSearch
        emptyMessage="No directories available. Open a workspace in the epic first."
      />
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-2.5 py-2.5">
        <div className="min-w-0 text-xs text-muted-foreground">
          {folderlessCwdStatus}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={launchTarget === null}
          onClick={handleLaunch}
        >
          Launch
        </Button>
      </div>
    </>
  );
}

/**
 * Default row for the terminal picker, mirroring the git diff panel's
 * `pickDefaultRow`: skip rows the host disabled (setup pending/failed, missing
 * worktree, ...), prefer the primary directory the agent runs in, and otherwise
 * take the first selectable row. Returns null when nothing is selectable so
 * Launch stays disabled. Terminals don't require a git repo, so selectability
 * is just `disabledReason === null` (unlike the git surfaces' `isGitSelectable`).
 */
function pickDefaultTerminalRow(
  rows: ReadonlyArray<WorktreeBindingSelectorRow>,
): WorktreeBindingSelectorRow | null {
  const selectable = rows.filter((row) => row.disabledReason === null);
  if (selectable.length === 0) return null;
  return selectable.find((row) => row.isPrimary) ?? selectable[0];
}

/**
 * The user's explicit pick wins while it stays selectable; if it vanishes or
 * the host disables it (e.g. its worktree goes missing), fall back to the
 * default. Re-reads the row from the live list so a selected row keeps fresh
 * fields across binding updates.
 */
function resolveTerminalSelection(
  explicit: WorktreeBindingSelectorRow | null,
  rows: ReadonlyArray<WorktreeBindingSelectorRow>,
): WorktreeBindingSelectorRow | null {
  if (explicit !== null) {
    const explicitKey = worktreeRowKey(explicit);
    const live = rows.find(
      (row) =>
        worktreeRowKey(row) === explicitKey && row.disabledReason === null,
    );
    if (live !== undefined) return live;
  }
  return pickDefaultTerminalRow(rows);
}

function resolveFolderlessTerminalTarget(
  enabled: boolean,
  hostId: string | null,
  cwd: string | undefined,
): TerminalLaunchTarget | null {
  if (!enabled || hostId === null || cwd === undefined || cwd.length === 0) {
    return null;
  }
  return { hostId, cwd };
}
