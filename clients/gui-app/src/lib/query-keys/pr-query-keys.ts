/**
 * Query key builders for the `pr.*` host stream surface.
 * Scope: `pr-panel-and-list-hook` ticket (Epic PR View T5).
 */

import { hostQueryKeys } from "./host-query-keys";

export const prQueryKeys = {
  /**
   * Query key for the epic-scoped PR list cache
   * (`pr.subscribeListForEpic`). Scoped by `(hostId, epicId)` only - NOT by
   * `mode`: a background and a foreground subscription for the same epic
   * feed the same cache entry (the host runs one poller per
   * `(hostId, epicId)` regardless of how many modes are subscribed).
   */
  listForEpic: (hostId: string | null, epicId: string) =>
    [...hostQueryKeys.scope(hostId), "pr", "listForEpic", epicId] as const,
};
