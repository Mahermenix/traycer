import type {
  ClaimAgentRoleResponse,
  ListAgentRolesResponse,
  RelinquishAgentRoleResponse,
  RoleAwarenessDelivery,
  RoleClaimWire,
} from "@traycer/protocol/host/agent/roles";

/**
 * ONE rendering for role operations, shared verbatim by the host's GUI tool
 * results and the CLI's human output - byte-identical text on both surfaces
 * for the same response is a contract requirement, so neither surface may
 * post-process what these return.
 *
 * These format SUCCESS response schemas ONLY. Failures are typed errors with
 * their own per-surface envelopes (tool `isError` text, CLI error codes); a
 * formatter that pretended to render exceptions would invite surfaces to
 * catch-and-stringify instead of surfacing the typed result.
 */
export function formatClaimRoleResponse(
  response: ClaimAgentRoleResponse,
): string {
  const lines = [
    response.created
      ? `Claimed role ${claimLabel(response.claim)}.`
      : `You already hold this role - existing claim returned unchanged (safe retry).`,
    `claimId: ${response.claim.claimId}`,
  ];
  if (response.overlapping.length > 0) {
    lines.push(
      `Overlap: ${response.overlapping
        .map((claim) => `${claimLabel(claim)} held by agent ${claim.agentId}`)
        .join(
          "; ",
        )}. Overlaps are allowed, but check whether this duplication is intentional.`,
    );
  }
  lines.push(formatAwarenessSummary(response.awareness));
  return lines.join("\n");
}

export function formatListRolesResponse(
  response: ListAgentRolesResponse,
): string {
  if (response.claims.length === 0) {
    return "No roles are claimed in this Task yet.";
  }
  // The response array order IS the projection's deterministic order; the
  // formatter adds no re-sort so every surface renders the same sequence.
  const rows = response.claims.map(
    (claim) =>
      `- ${claimLabel(claim)} - held by agent ${claim.agentId} (claimId: ${claim.claimId})`,
  );
  return ["Roles currently claimed in this Task:", ...rows].join("\n");
}

export function formatRelinquishRoleResponse(
  response: RelinquishAgentRoleResponse,
): string {
  if (!response.released) {
    // Foreign-account and absent/already-released claim ids deliberately share
    // this one rendering - no existence oracle.
    return "No matching claim to relinquish - it may already be released.";
  }
  return [
    "Role relinquished.",
    formatAwarenessSummary(response.awareness),
  ].join("\n");
}

function claimLabel(claim: RoleClaimWire): string {
  return `\`${claim.role}\` over \`${claim.scope}\``;
}

/**
 * Partial delivery is explicit without implying registry failure: the claim
 * or release is durable by the time this is computed, and this line only
 * reports who happened to be reachable to hear about it.
 */
function formatAwarenessSummary(delivery: RoleAwarenessDelivery): string {
  const parts = [
    `delivered ${delivery.deliveredTo.length}`,
    `unreachable ${delivery.unreachable.length}`,
  ];
  if (delivery.failed.length > 0) {
    const reasons = delivery.failed
      .map((entry) => `${entry.agentId}: ${entry.reason}`)
      .join(", ");
    parts.push(`failed ${delivery.failed.length} (${reasons})`);
  } else {
    parts.push("failed 0");
  }
  return `Awareness: ${parts.join(" · ")}. The registry update is durable regardless.`;
}
