import type {
  WorktreeHostEntryV14,
  WorktreeListAllForHostRequestV14,
} from "@traycer/protocol/host";
import { classifyWorktreeDeletion } from "./classify-worktree";
import type { HostRpcRequestOptions } from "../host-transport/host-messenger";

export const WORKTREE_DELETE_PRECHECK_REQUEST_OPTIONS: HostRpcRequestOptions = {
  requiredHostCanonicalVersion: {
    comparison: "minimum",
    version: { major: 1, minor: 4 },
  },
};

export type AuthoritativeDeletePreflightDecision =
  | { readonly kind: "ready"; readonly target: WorktreeHostEntryV14 }
  | { readonly kind: "missing" }
  | { readonly kind: "unresolved"; readonly target: WorktreeHostEntryV14 }
  | {
      readonly kind: "bound";
      readonly target: WorktreeHostEntryV14;
      readonly bindingCount: number;
      readonly ownerIdentifiers: readonly string[];
    };

export function buildWorktreeDeletePreflightRequest(
  worktreePath: string,
): WorktreeListAllForHostRequestV14 {
  return {
    includeActivity: false,
    activityPaths: [worktreePath],
    cursor: null,
    limit: null,
    forceRefresh: true,
  };
}

export function decideAuthoritativeDeletePreflightTarget(
  target: WorktreeHostEntryV14 | undefined,
): AuthoritativeDeletePreflightDecision {
  if (target === undefined) {
    return { kind: "missing" };
  }
  if (target.resolvedAt === null) {
    return { kind: "unresolved", target };
  }
  const deletion = classifyWorktreeDeletion(target);
  if (deletion.bindingCount > 0) {
    return {
      kind: "bound",
      target,
      bindingCount: deletion.bindingCount,
      ownerIdentifiers: stableOwnerIdentifiers(target),
    };
  }
  return { kind: "ready", target };
}

export function stableOwnerIdentifiers(
  entry: WorktreeHostEntryV14,
): readonly string[] {
  return entry.owners
    .map((owner) => `${owner.ownerKind}:${owner.ownerId}`)
    .toSorted((left, right) => left.localeCompare(right));
}
