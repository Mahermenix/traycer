/**
 * ONE rendering for role responses, shared verbatim by the host GUI tools and
 * the CLI. These tests pin the CONTENT contract: idempotent-retry wording,
 * overlap discouragement, explicit partial-delivery summary that never implies
 * registry failure, the empty-registry line, deterministic order preservation
 * (the formatter must not re-sort), and the no-oracle relinquish rendering.
 */
import { describe, expect, it } from "vitest";
import {
  formatClaimRoleResponse,
  formatListRolesResponse,
  formatRelinquishRoleResponse,
} from "../agent-roles-format";
import type { RoleClaimWire } from "../../host/agent/roles";

function claim(overrides: Partial<RoleClaimWire>): RoleClaimWire {
  return {
    claimId: "11111111-1111-4111-8111-111111111111",
    agentId: "agent-1",
    role: "Planner",
    scope: "auth migration",
    claimedAt: 10,
    ...overrides,
  };
}

const NO_AWARENESS = { deliveredTo: [], unreachable: [], failed: [] };

describe("formatClaimRoleResponse", () => {
  it("renders a fresh claim with its claimId and delivery summary", () => {
    const text = formatClaimRoleResponse({
      claim: claim({}),
      created: true,
      overlapping: [],
      awareness: {
        deliveredTo: ["peer-1", "peer-2"],
        unreachable: ["peer-3"],
        failed: [],
      },
    });
    expect(text).toContain("Claimed role `Planner` over `auth migration`.");
    expect(text).toContain("claimId: 11111111-1111-4111-8111-111111111111");
    expect(text).toContain("delivered 2 · unreachable 1 · failed 0");
    // Partial reachability never reads as registry failure.
    expect(text).toContain("The registry update is durable regardless.");
  });

  it("renders an idempotent retry as EXISTING, never as a new claim", () => {
    const text = formatClaimRoleResponse({
      claim: claim({}),
      created: false,
      overlapping: [],
      awareness: NO_AWARENESS,
    });
    expect(text).toContain("You already hold this role");
    expect(text).toContain("safe retry");
    expect(text).not.toContain("Claimed role");
  });

  it("surfaces overlap with the holding agents and a duplication nudge", () => {
    const text = formatClaimRoleResponse({
      claim: claim({}),
      created: true,
      overlapping: [
        claim({
          claimId: "22222222-2222-4222-8222-222222222222",
          agentId: "peer-9",
        }),
      ],
      awareness: NO_AWARENESS,
    });
    expect(text).toContain("held by agent peer-9");
    expect(text).toContain("duplication is intentional");
  });

  it("names each failed recipient with its reason - partial failure is explicit", () => {
    const text = formatClaimRoleResponse({
      claim: claim({}),
      created: true,
      overlapping: [],
      awareness: {
        deliveredTo: [],
        unreachable: [],
        failed: [{ agentId: "peer-4", reason: "timeout" }],
      },
    });
    expect(text).toContain("failed 1 (peer-4: timeout)");
  });
});

describe("formatListRolesResponse", () => {
  it("renders the explicit empty-registry line", () => {
    expect(formatListRolesResponse({ claims: [] })).toBe(
      "No roles are claimed in this Task yet.",
    );
  });

  it("preserves the response order EXACTLY - the projection ordered it, the formatter must not re-sort", () => {
    const zebra = claim({
      claimId: "99999999-9999-4999-8999-999999999999",
      role: "Zebra",
    });
    const alpha = claim({
      claimId: "00000000-0000-4000-8000-000000000000",
      role: "Alpha",
    });
    const text = formatListRolesResponse({ claims: [zebra, alpha] });
    const zebraAt = text.indexOf("`Zebra`");
    const alphaAt = text.indexOf("`Alpha`");
    expect(zebraAt).toBeGreaterThan(-1);
    expect(alphaAt).toBeGreaterThan(zebraAt);
    expect(text).toContain("(claimId: 99999999-9999-4999-8999-999999999999)");
  });
});

describe("formatRelinquishRoleResponse", () => {
  it("renders a release with its delivery summary", () => {
    const text = formatRelinquishRoleResponse({
      released: true,
      awareness: { deliveredTo: ["peer-1"], unreachable: [], failed: [] },
    });
    expect(text).toContain("Role relinquished.");
    expect(text).toContain("delivered 1");
  });

  it("renders released:false as ONE no-oracle line - foreign and absent claims are indistinguishable", () => {
    const text = formatRelinquishRoleResponse({
      released: false,
      awareness: NO_AWARENESS,
    });
    expect(text).toBe(
      "No matching claim to relinquish - it may already be released.",
    );
  });
});
