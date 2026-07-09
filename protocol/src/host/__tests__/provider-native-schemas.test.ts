import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  downgradeProviderCliStateToV10,
  providerCliStateSchema,
  providerCliStateSchemaV10,
  providersListResponseSchema,
  providersListResponseSchemaV10,
  providersListResponseSchemaV20,
  providersListResponseSchemaV30,
  providersSetApiKeyResponseSchemaV20,
} from "@traycer/protocol/host/provider-schemas";
import {
  providersListDowngradeV31ToV10,
  providersListDowngradeV31ToV20,
  providersListDowngradeV31ToV30,
  providersListUpgradeV30ToV31,
} from "@traycer/protocol/host/registry";
import {
  providersMcpAuthV10,
  providersMcpDiscoverV10,
  providersMcpListV10,
  providersMcpMutateV10,
  providersPluginsListV10,
  providersPluginsMutateV10,
  providersSkillsListV10,
  providersSkillsMutateV10,
} from "@traycer/protocol/host/provider-native-contracts";
import {
  providerMcpToolSchema,
  providerNativeCapabilitiesSchema,
  providerNativeScopeSchema,
  providersMcpAuthRequestSchema,
  providersMcpAuthResponseSchema,
  providersMcpListRequestSchema,
  providersMcpMutateRequestSchema,
} from "@traycer/protocol/host/provider-native-schemas";

function baseState(providerId: string) {
  return {
    providerId,
    enabled: true,
    disabledBy: null,
    selected: { kind: "bundled" as const },
    candidates: [],
    auth: {
      status: "unknown" as const,
      badgeText: null,
      label: null,
      detail: null,
    },
    authPending: false,
    checkedAt: null,
    apiKey: { supported: false, configured: false, source: null },
    terminalAgentArgs: "",
    envOverrides: [],
    loginCapability: null,
    availabilityPending: false,
  };
}

const sampleMcpCapabilities = {
  transports: ["stdio", "http"] as const,
  scopes: ["global", "project"] as const,
  authTypes: ["none", "oauth"] as const,
  authActions: ["login", "logout"] as const,
  mutationActions: ["add", "update", "remove", "toggleServer", "toggleTool"] as const,
  addServer: "cli" as const,
  removeServer: "cli" as const,
  updateServer: "patch" as const,
  perToolBacking: "store" as const,
  statusSource: "native" as const,
  toolsSource: "native" as const,
  schemasSource: "probe" as const,
  instructionsSource: "probe" as const,
  traycerSessionsOnlyEnforcement: true,
  stdioDegradeNotice: false,
  oauthDegradesToConfigOnly: true,
};

describe("nativeCapabilities on ProviderCliState", () => {
  it("parses latest state with nativeCapabilities", () => {
    const state = providerCliStateSchema.parse({
      ...baseState("codex"),
      nativeCapabilities: {
        supportedTabs: ["general", "env", "usage", "mcp"],
        mcp: sampleMcpCapabilities,
        plugins: null,
        skills: { canList: true, canAdd: true, canImport: false },
      },
    });
    expect(state.nativeCapabilities.mcp?.perToolBacking).toBe("store");
    expect(state.nativeCapabilities.mcp?.traycerSessionsOnlyEnforcement).toBe(
      true,
    );
  });

  it("defaults nativeCapabilities via .catch for old-host wire shapes", () => {
    const state = providerCliStateSchema.parse(baseState("cursor"));
    expect(state.nativeCapabilities).toEqual(
      DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
    );
  });

  it("encodes V1 degraded per-tool and store-backed branches", () => {
    expect(
      providerNativeCapabilitiesSchema.parse({
        supportedTabs: ["general", "mcp"],
        mcp: {
          ...sampleMcpCapabilities,
          perToolBacking: "degraded-server-level",
          stdioDegradeNotice: true,
        },
        plugins: null,
        skills: null,
      }).mcp?.perToolBacking,
    ).toBe("degraded-server-level");
  });
});

describe("providers.list@3.1 upgrade/downgrade bridges", () => {
  it("upgrades v3.0 responses with the default descriptor", () => {
    const v30 = providersListResponseSchemaV30.parse({
      providers: [baseState("amp")],
    });
    const upgraded = providersListUpgradeV30ToV31.upgradeResponse(v30);
    expect(upgraded.providers[0]?.nativeCapabilities).toEqual(
      DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
    );
    expect(() => providersListResponseSchema.parse(upgraded)).not.toThrow();
  });

  it("downgrades v3.1 → v3.0 by stripping nativeCapabilities", () => {
    const v31 = providersListResponseSchema.parse({
      providers: [
        {
          ...baseState("amp"),
          nativeCapabilities: {
            supportedTabs: ["general", "mcp", "plugins"],
            mcp: sampleMcpCapabilities,
            plugins: {
              addModes: ["file-drop"],
              marketplaceBrowse: false,
              canEnableDisable: false,
              canRemove: true,
              traycerSessionToolsNotice: true,
            },
            skills: null,
          },
        },
      ],
    });
    const result = providersListDowngradeV31ToV30.downgradeResponse(v31);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providers[0]).not.toHaveProperty("nativeCapabilities");
    expect(() =>
      providersListResponseSchemaV30.parse(result.value),
    ).not.toThrow();
  });

  it("downgrades v3.1 → v2.0 dropping Amp and nativeCapabilities", () => {
    const v31 = providersListResponseSchema.parse({
      providers: [
        {
          ...baseState("cursor"),
          nativeCapabilities: DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
        },
        {
          ...baseState("amp"),
          nativeCapabilities: DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
        },
      ],
    });
    const result = providersListDowngradeV31ToV20.downgradeResponse(v31);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.providers.map((provider) => provider.providerId),
    ).toEqual(["cursor"]);
    expect(result.value.providers[0]).not.toHaveProperty("nativeCapabilities");
    expect(() =>
      providersListResponseSchemaV20.parse(result.value),
    ).not.toThrow();
  });

  it("strips nativeCapabilities in V10 strictObject downgrade (silent-data-loss trap)", () => {
    const latest = providerCliStateSchema.parse({
      ...baseState("cursor"),
      nativeCapabilities: {
        supportedTabs: ["general", "mcp"],
        mcp: sampleMcpCapabilities,
        plugins: null,
        skills: null,
      },
    });
    const downgraded = downgradeProviderCliStateToV10(latest);
    expect(downgraded).not.toBeNull();
    if (downgraded === null) return;
    expect(downgraded).not.toHaveProperty("nativeCapabilities");
    expect(downgraded).not.toHaveProperty("availabilityPending");
    expect(() => providerCliStateSchemaV10.parse(downgraded)).not.toThrow();

    // Round-trip via list bridge
    const list = providersListResponseSchema.parse({ providers: [latest] });
    const listResult = providersListDowngradeV31ToV10.downgradeResponse(list);
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    expect(listResult.value.providers[0]).not.toHaveProperty(
      "nativeCapabilities",
    );
    expect(() =>
      providersListResponseSchemaV10.parse(listResult.value),
    ).not.toThrow();
  });

  it("dispatcher path: frozen list@3.0 / mutation@2.0 schemas strip nativeCapabilities", () => {
    // Same-major-minor runtime path: a latest-shaped payload is re-parsed
    // through the frozen older-minor response schema (framework additive
    // strip). Proves the dispatcher path is safe, not just the helper.
    const latestList = providersListResponseSchema.parse({
      providers: [
        {
          ...baseState("cursor"),
          nativeCapabilities: {
            supportedTabs: ["general", "mcp"],
            mcp: sampleMcpCapabilities,
            plugins: null,
            skills: null,
          },
        },
      ],
    });
    expect(latestList.providers[0]).toHaveProperty("nativeCapabilities");

    const asV30 = providersListResponseSchemaV30.parse(latestList);
    expect(asV30.providers[0]).not.toHaveProperty("nativeCapabilities");
    expect(asV30.providers[0]?.providerId).toBe("cursor");

    const latestMutation = {
      state: providerCliStateSchema.parse({
        ...baseState("cursor"),
        nativeCapabilities: {
          supportedTabs: ["general", "mcp"],
          mcp: sampleMcpCapabilities,
          plugins: null,
          skills: null,
        },
      }),
    };
    expect(latestMutation.state).toHaveProperty("nativeCapabilities");
    const asV20 = providersSetApiKeyResponseSchemaV20.parse(latestMutation);
    expect(asV20.state).not.toHaveProperty("nativeCapabilities");
    expect(asV20.state.providerId).toBe("cursor");
  });
});

describe("batched provider-native RPC contracts", () => {
  it("registers the eight unary methods at v1.0", () => {
    expect(providersMcpListV10.method).toBe("providers.mcpList");
    expect(providersMcpMutateV10.method).toBe("providers.mcpMutate");
    expect(providersMcpDiscoverV10.method).toBe("providers.mcpDiscover");
    expect(providersMcpAuthV10.method).toBe("providers.mcpAuth");
    expect(providersPluginsListV10.method).toBe("providers.pluginsList");
    expect(providersPluginsMutateV10.method).toBe("providers.pluginsMutate");
    expect(providersSkillsListV10.method).toBe("providers.skillsList");
    expect(providersSkillsMutateV10.method).toBe("providers.skillsMutate");
  });

  it("wire scope is global|project only", () => {
    expect(providerNativeScopeSchema.safeParse("global").success).toBe(true);
    expect(providerNativeScopeSchema.safeParse("project").success).toBe(true);
    expect(providerNativeScopeSchema.safeParse("cwd").success).toBe(false);
  });

  it("enforces scope/workspaceRoot invariant on request schemas", () => {
    expect(
      providersMcpListRequestSchema.safeParse({
        providerId: "claude-code",
        scope: "project",
        workspaceRoot: null,
      }).success,
    ).toBe(false);
    expect(
      providersMcpListRequestSchema.safeParse({
        providerId: "claude-code",
        scope: "project",
        workspaceRoot: "",
      }).success,
    ).toBe(false);
    expect(
      providersMcpListRequestSchema.safeParse({
        providerId: "claude-code",
        scope: "global",
        workspaceRoot: "/repo",
      }).success,
    ).toBe(false);
    expect(
      providersMcpListRequestSchema.safeParse({
        providerId: "claude-code",
        scope: "global",
        workspaceRoot: null,
      }).success,
    ).toBe(true);
    expect(
      providersMcpListRequestSchema.safeParse({
        providerId: "claude-code",
        scope: "project",
        workspaceRoot: "/repo",
      }).success,
    ).toBe(true);

    // Invariant also applied to extended request shapes (mutate/auth/etc.)
    expect(
      providersMcpMutateRequestSchema.safeParse({
        providerId: "amp",
        scope: "project",
        workspaceRoot: null,
        mutation: {
          action: "remove",
          name: "playwright",
        },
      }).success,
    ).toBe(false);
    expect(
      providersMcpAuthRequestSchema.safeParse({
        providerId: "droid",
        scope: "global",
        workspaceRoot: "/repo",
        auth: { action: "login", serverName: "linear" },
      }).success,
    ).toBe(false);
  });

  it("accepts mcpMutate action union and scope tuple", () => {
    const add = providersMcpMutateRequestSchema.parse({
      providerId: "claude-code",
      scope: "global",
      workspaceRoot: null,
      mutation: {
        action: "add",
        name: "playwright",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["@playwright/mcp"],
          env: null,
        },
      },
    });
    expect(add.mutation.action).toBe("add");

    const toggleTool = providersMcpMutateRequestSchema.parse({
      providerId: "amp",
      scope: "project",
      workspaceRoot: "/repo",
      mutation: {
        action: "toggleTool",
        serverName: "playwright",
        toolName: "browser_close",
        enabled: false,
      },
    });
    expect(toggleTool.mutation.action).toBe("toggleTool");
  });

  it("requires inputSchema to be a JSON-Schema object or null", () => {
    expect(
      providerMcpToolSchema.safeParse({
        name: "t",
        description: null,
        inputSchema: { type: "object", properties: {} },
        enabled: true,
        readOnly: false,
      }).success,
    ).toBe(true);
    expect(
      providerMcpToolSchema.safeParse({
        name: "t",
        description: null,
        inputSchema: null,
        enabled: true,
        readOnly: false,
      }).success,
    ).toBe(true);
    expect(
      providerMcpToolSchema.safeParse({
        name: "t",
        description: null,
        inputSchema: "not-an-object",
        enabled: true,
        readOnly: false,
      }).success,
    ).toBe(false);
  });

  it("models mcpAuth login result union", () => {
    const loginReq = providersMcpAuthRequestSchema.parse({
      providerId: "droid",
      scope: "global",
      workspaceRoot: null,
      auth: { action: "login", serverName: "linear" },
    });
    expect(loginReq.auth.action).toBe("login");

    expect(
      providersMcpAuthResponseSchema.parse({
        result: {
          kind: "authorizationUrl",
          authorizationUrl: "https://example.com/oauth",
        },
      }).result.kind,
    ).toBe("authorizationUrl");

    expect(
      providersMcpAuthResponseSchema.parse({
        result: { kind: "pendingInstruction", instruction: "Check log" },
      }).result.kind,
    ).toBe("pendingInstruction");

    expect(
      providersMcpAuthResponseSchema.parse({
        result: { kind: "done" },
      }).result.kind,
    ).toBe("done");

    expect(
      providersMcpAuthResponseSchema.parse({
        result: { kind: "unsupported", reason: "config-only" },
      }).result.kind,
    ).toBe("unsupported");

    expect(
      providersMcpAuthRequestSchema.parse({
        providerId: "copilot",
        scope: "global",
        workspaceRoot: null,
        auth: { action: "forceReauth", serverName: "github" },
      }).auth.action,
    ).toBe("forceReauth");

    expect(
      providersMcpAuthRequestSchema.parse({
        providerId: "droid",
        scope: "global",
        workspaceRoot: null,
        auth: { action: "submitCode", serverName: "linear", code: "123456" },
      }).auth.action,
    ).toBe("submitCode");
  });
});
