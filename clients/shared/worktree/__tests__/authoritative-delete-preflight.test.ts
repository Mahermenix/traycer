import { describe, expect, it } from "vitest";
import type { WorktreeHostEntryV14 } from "@traycer/protocol/host";
import { decideAuthoritativeDeletePreflightTarget } from "../authoritative-delete-preflight";

function entry(
  overrides: Partial<WorktreeHostEntryV14>,
): WorktreeHostEntryV14 {
  return {
    worktreePath: "/wt/x",
    repoLabel: "acme/app",
    repoIdentifier: { owner: "acme", repo: "app" },
    branch: "feat/x",
    inUse: false,
    uncommittedCount: 0,
    gitRemovable: true,
    scripts: null,
    owners: [],
    lastActivityAt: null,
    branchStatus: null,
    createdAt: null,
    prState: null,
    prNumber: null,
    prUrl: null,
    mergedHeadShaMatches: false,
    submodules: [],
    atBaseCommit: false,
    resolvedAt: 1,
    ...overrides,
  };
}

describe("decideAuthoritativeDeletePreflightTarget", () => {
  it("returns ready only for a shared delete-eligible target", () => {
    const target = entry({});

    expect(decideAuthoritativeDeletePreflightTarget(target)).toEqual({
      kind: "ready",
      target,
    });
  });

  it("returns a shared blocked decision for an in-use target with no bindings", () => {
    const target = entry({
      worktreePath: "/wt/in-use",
      branch: "feat-in-use",
      inUse: true,
      owners: [],
    });

    expect(decideAuthoritativeDeletePreflightTarget(target)).toEqual({
      kind: "blocked",
      target,
      deleteBlockers: ["in-use"],
    });
  });
});
