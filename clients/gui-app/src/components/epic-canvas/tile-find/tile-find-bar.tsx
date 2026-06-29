import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  ReplaceAll,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  selectTileFindUi,
  useTileFindStore,
} from "@/stores/tile-find/tile-find-store";
import type { TileFindStateSnapshot } from "@/stores/tile-find/types";

interface TileFindBarProps {
  readonly tileInstanceId: string;
}

export function TileFindBar(props: TileFindBarProps) {
  const { tileInstanceId } = props;
  const ui = useTileFindStore(selectTileFindUi(tileInstanceId));
  const setQuery = useTileFindStore((state) => state.setQuery);
  const setMatchCase = useTileFindStore((state) => state.setMatchCase);
  const setReplaceText = useTileFindStore((state) => state.setReplaceText);
  const search = useTileFindStore((state) => state.search);
  const next = useTileFindStore((state) => state.next);
  const previous = useTileFindStore((state) => state.previous);
  const replaceCurrent = useTileFindStore((state) => state.replaceCurrent);
  const replaceAll = useTileFindStore((state) => state.replaceAll);
  const close = useTileFindStore((state) => state.close);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ui?.isOpen !== true) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [ui?.isOpen, ui?.focusRequestNonce]);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(tileInstanceId, event.target.value);
      search(tileInstanceId);
    },
    [search, setQuery, tileInstanceId],
  );

  const handleMatchCase = useCallback(() => {
    if (ui === null) return;
    setMatchCase(tileInstanceId, !ui.matchCase);
    search(tileInstanceId);
  }, [search, setMatchCase, tileInstanceId, ui]);

  const handleReplaceTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setReplaceText(tileInstanceId, event.target.value);
    },
    [setReplaceText, tileInstanceId],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(tileInstanceId);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) previous(tileInstanceId);
        else next(tileInstanceId);
        return;
      }
      const isModG =
        event.key.toLowerCase() === "g" && (event.metaKey || event.ctrlKey);
      if (!isModG) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) previous(tileInstanceId);
      else next(tileInstanceId);
    },
    [close, next, previous, tileInstanceId],
  );

  if (ui === null || !ui.isOpen) return null;

  const snapshot = ui.lastSnapshot;
  const replaceEnabled = snapshot.capabilities.has("replace");
  const replaceAllEnabled = snapshot.capabilities.has("replaceAll");
  const showReplaceControls = replaceEnabled || replaceAllEnabled;
  const canNavigate = ui.query.length > 0 && snapshot.status !== "unavailable";
  const canSearch = snapshot.capabilities.has("find");

  return (
    <search
      data-testid="tile-find-bar"
      className={cn(
        "pointer-events-auto absolute right-3 top-3 z-30 flex max-w-[min(92vw,42rem)] flex-wrap items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 shadow-md",
      )}
      aria-label="Find in tile"
    >
      <Input
        ref={inputRef}
        type="text"
        value={ui.query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        aria-label="Find in tile"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-7 w-[min(42vw,14rem)] min-w-[8rem] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
      <TileFindStatusLabel snapshot={snapshot} />
      <Button
        type="button"
        variant={ui.matchCase ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Match case"
        aria-pressed={ui.matchCase}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleMatchCase}
        disabled={!canSearch}
      >
        <CaseSensitive className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Previous match"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => previous(tileInstanceId)}
        disabled={!canNavigate}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Next match"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => next(tileInstanceId)}
        disabled={!canNavigate}
      >
        <ChevronDown className="size-4" />
      </Button>
      {showReplaceControls ? (
        <div className="flex min-w-0 items-center gap-1">
          <Input
            type="text"
            value={ui.replaceText}
            onChange={handleReplaceTextChange}
            placeholder="Replace"
            aria-label="Replace with"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-7 w-[min(34vw,12rem)] min-w-[7rem] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Replace current match"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceCurrent(tileInstanceId)}
            disabled={!replaceEnabled || ui.query.length === 0}
          >
            <Replace className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Replace all matches"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => replaceAll(tileInstanceId)}
            disabled={!replaceAllEnabled || ui.query.length === 0}
          >
            <ReplaceAll className="size-4" />
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close find"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => close(tileInstanceId)}
      >
        <X className="size-4" />
      </Button>
    </search>
  );
}

function TileFindStatusLabel(props: {
  readonly snapshot: TileFindStateSnapshot;
}) {
  const { snapshot } = props;
  const label = statusLabel(snapshot);
  if (label === null) return null;
  const destructive =
    snapshot.status === "error" ||
    (snapshot.status !== "searching" &&
      snapshot.query.length > 0 &&
      snapshot.total === 0);
  return (
    <span
      className={cn(
        "min-w-[5ch] text-right text-ui-xs text-muted-foreground",
        destructive && "text-destructive",
        snapshot.status === "partial" && "text-amber-600 dark:text-amber-400",
      )}
      data-status={snapshot.status}
      title={snapshot.coverageMessage ?? snapshot.errorMessage ?? undefined}
    >
      {label}
    </span>
  );
}

function statusLabel(snapshot: TileFindStateSnapshot): string | null {
  if (snapshot.status === "searching") return "Searching";
  if (snapshot.status === "unavailable") {
    return snapshot.coverageMessage ?? "Unavailable";
  }
  if (snapshot.status === "error") {
    return snapshot.errorMessage ?? "Error";
  }
  if (snapshot.query.length === 0) return null;
  if (snapshot.total === 0) return "No matches";
  if (snapshot.status === "partial") {
    return `${snapshot.current} of ${snapshot.total} partial`;
  }
  return `${snapshot.current} of ${snapshot.total}`;
}
