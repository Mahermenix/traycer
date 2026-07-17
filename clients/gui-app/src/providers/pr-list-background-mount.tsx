import { useEffect, useRef, type ReactNode } from "react";
import { usePrListSubscription } from "@/hooks/pr/use-pr-list-subscription";
import { useReactiveActiveHostId } from "@/hooks/host/use-reactive-active-host-id";
import { useStreamMethodSupport } from "@/lib/host/stream-runtime-context";
import {
  buildPrSeenFactsMap,
  evaluatePrListAgainstBaseline,
} from "@/lib/pr/pr-changed-dot";
import {
  useLeftPanelSectionCollapsed,
  useMainPanelCollapsed,
} from "@/stores/epics/left-panel-store";
import {
  selectPrSeenFactsScope,
  usePrSeenFactsStore,
} from "@/stores/epics/pr-seen-facts-store";

export interface PrListBackgroundMountProps {
  readonly epicId: string;
  readonly tabId: string;
}

/**
 * Epic-shell standing background subscription for PR list freshness + the
 * renderer-owned changed-dot (T7). Mounted once per open epic pane; the list
 * hook ref-counts by `…|background` so multi-pane keep-alives share one
 * transport session. Unmount of the last pane releases the subscription —
 * zero PR traffic when the epic is closed.
 *
 * Panel visibility (sidebar expanded ∧ pull-requests section expanded) is
 * read from the left-panel store so we never touch the PR panel body (T6).
 * While visible: baseline advances continuously and the dot is cleared.
 * While hidden: directional deltas light `hasChanged`.
 */
export function PrListBackgroundMount(
  props: PrListBackgroundMountProps,
): ReactNode {
  const hostId = useReactiveActiveHostId();
  const methodSupport = useStreamMethodSupport("pr.subscribeListForEpic");
  const methodSupported = methodSupport !== "unsupported";

  const subscription = usePrListSubscription({
    hostId,
    epicId: props.epicId,
    mode: "background",
    enabled: methodSupported,
  });

  const mainCollapsed = useMainPanelCollapsed(props.tabId);
  const sectionCollapsed = useLeftPanelSectionCollapsed("pull-requests");
  const panelVisible = !mainCollapsed && !sectionCollapsed;

  const scopeState = usePrSeenFactsStore((s) =>
    hostId === null
      ? { seeded: false, hasChanged: false, factsByPrKey: {} }
      : selectPrSeenFactsScope(hostId, props.epicId)(s),
  );
  const seedBaseline = usePrSeenFactsStore((s) => s.seedBaseline);
  const advanceBaseline = usePrSeenFactsStore((s) => s.advanceBaseline);
  const markChanged = usePrSeenFactsStore((s) => s.markChanged);
  const clearChanged = usePrSeenFactsStore((s) => s.clearChanged);

  const wasPanelVisibleRef = useRef(panelVisible);

  // Clear the dot the moment the panel becomes visible (open clears).
  useEffect(() => {
    if (hostId === null) return;
    const becameVisible = panelVisible && !wasPanelVisibleRef.current;
    wasPanelVisibleRef.current = panelVisible;
    if (becameVisible) {
      clearChanged(hostId, props.epicId);
    }
  }, [clearChanged, hostId, panelVisible, props.epicId]);

  useEffect(() => {
    if (hostId === null) return;
    const data = subscription.data;
    if (data === null) return;

    const items = data.items;

    if (panelVisible) {
      // Watching: absorb every frame into the baseline; never light the dot.
      advanceBaseline(hostId, props.epicId, buildPrSeenFactsMap(items));
      clearChanged(hostId, props.epicId);
      return;
    }

    if (!scopeState.seeded) {
      // First-ever open of this (host, epic): silent seed, no dot.
      seedBaseline(hostId, props.epicId, buildPrSeenFactsMap(items));
      return;
    }

    const { hasDotWorthyDelta, nextFacts } = evaluatePrListAgainstBaseline({
      baseline: scopeState.factsByPrKey,
      items,
    });
    // Always advance the baseline so the same delta is not re-fired, and so
    // first-sight of a new PR key is absorbed as a seed on this frame.
    advanceBaseline(hostId, props.epicId, nextFacts);
    if (hasDotWorthyDelta) {
      markChanged(hostId, props.epicId);
    }
  }, [
    advanceBaseline,
    clearChanged,
    hostId,
    markChanged,
    panelVisible,
    props.epicId,
    scopeState.factsByPrKey,
    scopeState.seeded,
    seedBaseline,
    subscription.data,
  ]);

  return null;
}
