/**
 * Schemas for provider-native MCP / plugins / skills capability descriptors
 * and the batched `providers.mcp*` / `providers.plugins*` / `providers.skills*`
 * RPC surface. The descriptor rides `ProviderCliState.nativeCapabilities`; the
 * verbs are separate unary methods (one gated protocol PR).
 *
 * Content is computed host-side from the contract registry (ticket 04) — no
 * probing at `providers.list` time. Enums encode every verification-gate
 * branch so a later gate outcome does not force another protocol PR.
 */
import { z } from "zod";
import { providerIdSchema } from "./provider-ids";

// ── Scope tuple (shared by every native verb) ──────────────────────────────

/** Wire scope is `global | project` only (tech-plan Decision 5). Provider
 * cwd-local files (e.g. kimi-code `.kimi-code/mcp.json`) are host path-contract
 * details, not a third wire scope. */
export const providerNativeScopeSchema = z.enum(["global", "project"]);
export type ProviderNativeScope = z.infer<typeof providerNativeScopeSchema>;

/**
 * Base object for the scope tuple — kept unrefined so request schemas can
 * `.extend()` it. Apply {@link withProviderNativeScopeInvariant} to each
 * final request schema so the wire enforces:
 * - `scope: "project"` → non-empty `workspaceRoot`
 * - `scope: "global"` → `workspaceRoot: null`
 */
export const providerNativeScopeTupleBaseSchema = z.object({
  providerId: providerIdSchema,
  scope: providerNativeScopeSchema,
  workspaceRoot: z.string().nullable(),
});

/**
 * Refine any object schema that includes the scope-tuple fields. Applied only
 * to final request schemas (not the base) so `.extend()` composition stays
 * intact.
 */
export function withProviderNativeScopeInvariant<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
) {
  return schema.superRefine((value, ctx) => {
    if (!("scope" in value) || !("workspaceRoot" in value)) {
      return;
    }
    const scope = value.scope;
    const workspaceRoot = value.workspaceRoot;
    if (scope !== "global" && scope !== "project") {
      return;
    }
    if (typeof workspaceRoot !== "string" && workspaceRoot !== null) {
      return;
    }
    if (scope === "project") {
      if (workspaceRoot === null || workspaceRoot.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["workspaceRoot"],
          message: 'scope "project" requires a non-empty workspaceRoot',
        });
      }
      return;
    }
    if (workspaceRoot !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["workspaceRoot"],
        message: 'scope "global" requires workspaceRoot: null',
      });
    }
  });
}

export const providerNativeScopeTupleSchema = withProviderNativeScopeInvariant(
  providerNativeScopeTupleBaseSchema,
);
export type ProviderNativeScopeTuple = z.infer<
  typeof providerNativeScopeTupleSchema
>;

// ── Capability descriptor (rides ProviderCliState) ─────────────────────────

export const providerSettingsTabSchema = z.enum([
  "general",
  "env",
  "usage",
  "mcp",
  "plugins",
  "skills",
]);
export type ProviderSettingsTab = z.infer<typeof providerSettingsTabSchema>;

export const providerMcpTransportSchema = z.enum(["stdio", "http", "sse"]);
export type ProviderMcpTransport = z.infer<typeof providerMcpTransportSchema>;

export const providerMcpAuthTypeSchema = z.enum([
  "none",
  "headers",
  "oauth",
]);
export type ProviderMcpAuthType = z.infer<typeof providerMcpAuthTypeSchema>;

/**
 * Auth actions the UI may render for this provider. Descriptor-driven so
 * config-only providers never show a fake login button.
 * - `login` / `submitCode` / `logout` / `clearAuth` — standard flows
 * - `forceReauth` — copilot-style "logout" (no clean logout; re-auth only)
 */
export const providerMcpAuthActionSchema = z.enum([
  "login",
  "submitCode",
  "logout",
  "clearAuth",
  "forceReauth",
]);
export type ProviderMcpAuthAction = z.infer<typeof providerMcpAuthActionSchema>;

/**
 * Mutation verbs the host will accept for this provider. Cursor has no
 * cli-add/remove (patch + enable/disable only); opencode has CLI add but no
 * remove; kimi is patch-only; etc.
 */
export const providerMcpMutationActionSchema = z.enum([
  "add",
  "update",
  "remove",
  "toggleServer",
  "toggleTool",
]);
export type ProviderMcpMutationAction = z.infer<
  typeof providerMcpMutationActionSchema
>;

/**
 * How per-tool toggles are persisted.
 * - `native` — provider config fields (opencode tools map, droid lists, kiro
 *   disabledTools, copilot `tools[]` allowlist, kilocode permissions, …)
 * - `store` — Traycer-owned store + session injection (amp, codex; also
 *   grok/kimi when V1 per-tool identity is confirmed)
 * - `degraded-server-level` — V1 fallback: server enable/disable only, tools
 *   grid read-only (grok/kimi until request_permission identity is proven)
 * - `none` — no per-tool control in v1
 */
export const providerMcpPerToolBackingSchema = z.enum([
  "native",
  "store",
  "degraded-server-level",
  "none",
]);
export type ProviderMcpPerToolBacking = z.infer<
  typeof providerMcpPerToolBackingSchema
>;

/**
 * Where live server status / tool names / schemas come from.
 * - `native` — provider CLI/RPC
 * - `probe` — Traycer MCP client (no-auth / API-key servers only)
 * - `none` — capability unavailable
 */
export const providerMcpDataSourceSchema = z.enum(["native", "probe", "none"]);
export type ProviderMcpDataSource = z.infer<typeof providerMcpDataSourceSchema>;

/**
 * Write path for server CRUD. Cursor is patch-only; opencode CLI add + patch
 * remove; kimi patch-only (kimi-code has no `mcp` CLI).
 */
export const providerMcpWritePathSchema = z.enum(["cli", "patch", "none"]);
export type ProviderMcpWritePath = z.infer<typeof providerMcpWritePathSchema>;

export const providerMcpCapabilitiesSchema = z.object({
  transports: z.array(providerMcpTransportSchema),
  scopes: z.array(providerNativeScopeSchema),
  authTypes: z.array(providerMcpAuthTypeSchema),
  authActions: z.array(providerMcpAuthActionSchema),
  mutationActions: z.array(providerMcpMutationActionSchema),
  addServer: providerMcpWritePathSchema,
  removeServer: providerMcpWritePathSchema,
  updateServer: providerMcpWritePathSchema,
  perToolBacking: providerMcpPerToolBackingSchema,
  /**
   * Status dot source. UI labels probe results as connectivity checks, never
   * as "provider CLI is logged in."
   */
  statusSource: providerMcpDataSourceSchema,
  toolsSource: providerMcpDataSourceSchema,
  /**
   * Tool input schemas. Always `probe` or `none` today (universal native
   * negative for instructions; schemas follow the same rule except droid /
   * codex / amp / opencode-family native paths).
   */
  schemasSource: providerMcpDataSourceSchema,
  /** `initialize.instructions` — probe-only for every provider. */
  instructionsSource: z.enum(["probe", "none"]),
  /**
   * True when store-backed enforcement only applies inside Traycer-launched
   * sessions (codex `-c enabled_tools`, amp SDK `enabledTools`). UI shows
   * the "Traycer sessions only" note.
   */
  traycerSessionsOnlyEnforcement: z.boolean(),
  /**
   * V3 ACP fallback: stdio servers are config-management-only (cannot inject
   * over ACP). UI shows a degrade notice when true.
   */
  stdioDegradeNotice: z.boolean(),
  /**
   * OAuth'd servers have no Traycer probe path (wrong OAuth client). Status /
   * names only where a native source exists; hover schemas/instructions omit.
   */
  oauthDegradesToConfigOnly: z.boolean(),
});
export type ProviderMcpCapabilities = z.infer<
  typeof providerMcpCapabilitiesSchema
>;

/**
 * Plugins add modes.
 * - `cli-source` — install by source string / package ref via CLI
 * - `marketplace` — machine-readable marketplace browse + install
 * - `file-drop` — copy into plugins dir (amp)
 * - `patch` — edit config plugin array (opencode family)
 * - `read-only` — list only; no install button
 */
export const providerPluginsAddModeSchema = z.enum([
  "cli-source",
  "marketplace",
  "file-drop",
  "patch",
  "read-only",
]);
export type ProviderPluginsAddMode = z.infer<
  typeof providerPluginsAddModeSchema
>;

export const providerPluginsCapabilitiesSchema = z.object({
  addModes: z.array(providerPluginsAddModeSchema),
  /**
   * Machine-readable marketplace listing. False for droid/copilot/qwen
   * (text-only) — UI offers add-by-source instead of browse.
   */
  marketplaceBrowse: z.boolean(),
  canEnableDisable: z.boolean(),
  canRemove: z.boolean(),
  /**
   * V4 amp: plugins load for CLI `tools list` / `plugins list`, but plugin
   * tools are absent from Traycer `execute()` stream. UI warns when true.
   */
  traycerSessionToolsNotice: z.boolean(),
});
export type ProviderPluginsCapabilities = z.infer<
  typeof providerPluginsCapabilitiesSchema
>;

export const providerSkillsCapabilitiesSchema = z.object({
  canList: z.boolean(),
  canAdd: z.boolean(),
  canImport: z.boolean(),
});
export type ProviderSkillsCapabilities = z.infer<
  typeof providerSkillsCapabilitiesSchema
>;

/**
 * Per-capability facts the UI renders tabs/modals from. Null domain objects
 * mean the tab is unsupported (also reflected in `supportedTabs`).
 */
export const providerNativeCapabilitiesSchema = z.object({
  supportedTabs: z.array(providerSettingsTabSchema),
  mcp: providerMcpCapabilitiesSchema.nullable(),
  plugins: providerPluginsCapabilitiesSchema.nullable(),
  skills: providerSkillsCapabilitiesSchema.nullable(),
});
export type ProviderNativeCapabilities = z.infer<
  typeof providerNativeCapabilitiesSchema
>;

/**
 * Default descriptor for old-host responses / `.catch()` on wire parse.
 * Empty tabs → UI shows only the pre-existing General/Env/Usage surfaces
 * that do not depend on this field.
 */
export const DEFAULT_PROVIDER_NATIVE_CAPABILITIES: ProviderNativeCapabilities = {
  supportedTabs: ["general", "env", "usage"],
  mcp: null,
  plugins: null,
  skills: null,
};

// ── MCP list / server row ──────────────────────────────────────────────────

export const providerMcpServerStatusSchema = z.enum([
  "connected",
  "disconnected",
  "connecting",
  "needs_auth",
  "error",
  "unknown",
  "config_only",
]);
export type ProviderMcpServerStatus = z.infer<
  typeof providerMcpServerStatusSchema
>;

export const providerMcpServerTransportSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).nullable(),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).nullable(),
  }),
  z.object({
    type: z.literal("sse"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).nullable(),
  }),
]);
export type ProviderMcpServerTransport = z.infer<
  typeof providerMcpServerTransportSchema
>;

export const providerMcpToolSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  /**
   * JSON Schema object for tool input, when known. Null when names-only
   * (native without schemas) or not yet discovered.
   */
  inputSchema: z.record(z.string(), z.unknown()).nullable(),
  enabled: z.boolean(),
  /**
   * True when the tool row is display-only (degraded-server-level backing or
   * OAuth-degraded probe).
   */
  readOnly: z.boolean(),
});
export type ProviderMcpTool = z.infer<typeof providerMcpToolSchema>;

export const providerMcpServerSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  transport: providerMcpServerTransportSchema,
  status: providerMcpServerStatusSchema,
  /**
   * Which plane produced `status` — UI labels probe vs native differently.
   */
  statusSource: providerMcpDataSourceSchema,
  statusDetail: z.string().nullable(),
  tools: z.array(providerMcpToolSchema),
  /**
   * True while discovery is in-flight; client re-fetches / polls mcpList.
   */
  discoveryPending: z.boolean(),
  /**
   * `initialize.instructions` text when probe-available; null otherwise.
   */
  instructions: z.string().nullable(),
  /**
   * Server is OAuth-gated and Traycer cannot probe it; manage via provider
   * native surface / config only.
   */
  configOnly: z.boolean(),
  /**
   * Stdio server under an ACP provider that cannot inject stdio over ACP
   * (V3 degrade). Config editable; live connect unavailable in-session.
   */
  stdioDegraded: z.boolean(),
});
export type ProviderMcpServer = z.infer<typeof providerMcpServerSchema>;

export const providersMcpListRequestSchema = withProviderNativeScopeInvariant(
  providerNativeScopeTupleBaseSchema,
);
export type ProvidersMcpListRequest = z.infer<
  typeof providersMcpListRequestSchema
>;

export const providersMcpListResponseSchema = z.object({
  servers: z.array(providerMcpServerSchema),
});
export type ProvidersMcpListResponse = z.infer<
  typeof providersMcpListResponseSchema
>;

// ── MCP mutate ─────────────────────────────────────────────────────────────

export const providersMcpMutateActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    name: z.string().min(1),
    transport: providerMcpServerTransportSchema,
  }),
  z.object({
    action: z.literal("update"),
    name: z.string().min(1),
    transport: providerMcpServerTransportSchema,
  }),
  z.object({
    action: z.literal("remove"),
    name: z.string().min(1),
  }),
  z.object({
    action: z.literal("toggleServer"),
    name: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("toggleTool"),
    serverName: z.string().min(1),
    toolName: z.string().min(1),
    enabled: z.boolean(),
  }),
]);
export type ProvidersMcpMutateAction = z.infer<
  typeof providersMcpMutateActionSchema
>;

export const providersMcpMutateRequestSchema = withProviderNativeScopeInvariant(
  providerNativeScopeTupleBaseSchema.extend({
    mutation: providersMcpMutateActionSchema,
  }),
);
export type ProvidersMcpMutateRequest = z.infer<
  typeof providersMcpMutateRequestSchema
>;

export const providersMcpMutateResponseSchema = z.object({
  servers: z.array(providerMcpServerSchema),
});
export type ProvidersMcpMutateResponse = z.infer<
  typeof providersMcpMutateResponseSchema
>;

// ── MCP discover (one server: tools / schemas / instructions) ──────────────

export const providersMcpDiscoverRequestSchema =
  withProviderNativeScopeInvariant(
    providerNativeScopeTupleBaseSchema.extend({
      serverName: z.string().min(1),
      /**
       * When true, bypass the discovery cache and re-probe / re-query native.
       */
      forceRefresh: z.boolean(),
    }),
  );
export type ProvidersMcpDiscoverRequest = z.infer<
  typeof providersMcpDiscoverRequestSchema
>;

export const providersMcpDiscoverResponseSchema = z.object({
  server: providerMcpServerSchema,
});
export type ProvidersMcpDiscoverResponse = z.infer<
  typeof providersMcpDiscoverResponseSchema
>;

// ── MCP auth ───────────────────────────────────────────────────────────────

/**
 * Auth action union covering the full per-provider variety:
 * - droid: authenticate → submitCode → clearAuth
 * - copilot: login + forceReauth (no clean logout)
 * - kimi: probe/log-tail URL delivery
 * - config-only providers: unsupported
 */
export const providersMcpAuthActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    serverName: z.string().min(1),
  }),
  z.object({
    action: z.literal("submitCode"),
    serverName: z.string().min(1),
    code: z.string().min(1),
  }),
  z.object({
    action: z.literal("logout"),
    serverName: z.string().min(1),
  }),
  z.object({
    action: z.literal("clearAuth"),
    serverName: z.string().min(1),
  }),
  z.object({
    action: z.literal("forceReauth"),
    serverName: z.string().min(1),
  }),
]);
export type ProvidersMcpAuthAction = z.infer<
  typeof providersMcpAuthActionSchema
>;

export const providersMcpAuthRequestSchema = withProviderNativeScopeInvariant(
  providerNativeScopeTupleBaseSchema.extend({
    auth: providersMcpAuthActionSchema,
  }),
);
export type ProvidersMcpAuthRequest = z.infer<
  typeof providersMcpAuthRequestSchema
>;

/**
 * Login (and forceReauth) result union:
 * - `authorizationUrl` — open in browser, then poll mcpList
 * - `pendingInstruction` — show user-facing text (e.g. kimi log-tail path)
 * - `done` — completed synchronously (or logout/clear/submitCode success)
 * - `unsupported` — provider/server cannot perform this action
 */
export const providersMcpAuthResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("authorizationUrl"),
    authorizationUrl: z.string(),
  }),
  z.object({
    kind: z.literal("pendingInstruction"),
    instruction: z.string(),
  }),
  z.object({
    kind: z.literal("done"),
  }),
  z.object({
    kind: z.literal("unsupported"),
    reason: z.string().nullable(),
  }),
]);
export type ProvidersMcpAuthResult = z.infer<
  typeof providersMcpAuthResultSchema
>;

export const providersMcpAuthResponseSchema = z.object({
  result: providersMcpAuthResultSchema,
});
export type ProvidersMcpAuthResponse = z.infer<
  typeof providersMcpAuthResponseSchema
>;

// ── Plugins list / mutate ──────────────────────────────────────────────────

export const providerPluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  enabled: z.boolean(),
  source: z.string().nullable(),
  /**
   * True when the plugin is listed but cannot be toggled/removed in v1
   * (read-only tab).
   */
  readOnly: z.boolean(),
});
export type ProviderPlugin = z.infer<typeof providerPluginSchema>;

export const providersPluginsListRequestSchema =
  withProviderNativeScopeInvariant(providerNativeScopeTupleBaseSchema);
export type ProvidersPluginsListRequest = z.infer<
  typeof providersPluginsListRequestSchema
>;

export const providersPluginsListResponseSchema = z.object({
  plugins: z.array(providerPluginSchema),
});
export type ProvidersPluginsListResponse = z.infer<
  typeof providersPluginsListResponseSchema
>;

export const providersPluginsMutateActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({
      action: z.literal("add"),
      /**
       * Source string: npm/path/git/`plugin@marketplace`/local path depending
       * on provider add mode.
       */
      source: z.string().min(1),
    }),
    z.object({
      action: z.literal("remove"),
      id: z.string().min(1),
    }),
    z.object({
      action: z.literal("setEnabled"),
      id: z.string().min(1),
      enabled: z.boolean(),
    }),
  ],
);
export type ProvidersPluginsMutateAction = z.infer<
  typeof providersPluginsMutateActionSchema
>;

export const providersPluginsMutateRequestSchema =
  withProviderNativeScopeInvariant(
    providerNativeScopeTupleBaseSchema.extend({
      mutation: providersPluginsMutateActionSchema,
    }),
  );
export type ProvidersPluginsMutateRequest = z.infer<
  typeof providersPluginsMutateRequestSchema
>;

export const providersPluginsMutateResponseSchema = z.object({
  plugins: z.array(providerPluginSchema),
});
export type ProvidersPluginsMutateResponse = z.infer<
  typeof providersPluginsMutateResponseSchema
>;

// ── Skills list / mutate ───────────────────────────────────────────────────

export const providerSkillSourceBadgeSchema = z.enum([
  "shared",
  "provider",
  "plugin",
  "managed",
]);
export type ProviderSkillSourceBadge = z.infer<
  typeof providerSkillSourceBadgeSchema
>;

export const providerSkillSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  path: z.string(),
  source: providerSkillSourceBadgeSchema,
});
export type ProviderSkill = z.infer<typeof providerSkillSchema>;

export const providersSkillsListRequestSchema = withProviderNativeScopeInvariant(
  providerNativeScopeTupleBaseSchema,
);
export type ProvidersSkillsListRequest = z.infer<
  typeof providersSkillsListRequestSchema
>;

export const providersSkillsListResponseSchema = z.object({
  skills: z.array(providerSkillSchema),
});
export type ProvidersSkillsListResponse = z.infer<
  typeof providersSkillsListResponseSchema
>;

export const providersSkillsMutateActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({
      action: z.literal("add"),
      /**
       * Absolute path to a local skill directory (or SKILL.md file) to copy
       * into the shared or provider-native root.
       */
      sourcePath: z.string().min(1),
      /**
       * When true, write under the provider-native root; otherwise the shared
       * `~/.agents/skills` root.
       */
      providerScoped: z.boolean(),
    }),
    z.object({
      action: z.literal("create"),
      /** Skill directory / frontmatter name (host validates name pattern). */
      name: z.string().min(1),
      description: z.string(),
      body: z.string(),
      /**
       * When true, write under the provider-native root; otherwise the shared
       * `~/.agents/skills` root.
       */
      providerScoped: z.boolean(),
    }),
    z.object({
      action: z.literal("import"),
      /**
       * File, URL, or directory depending on provider (e.g. copilot
       * `skill add`).
       */
      source: z.string().min(1),
      /**
       * When true, write under the provider-native root; otherwise the shared
       * `~/.agents/skills` root. Copilot CLI install is used only when
       * provider-scoped (its store is inherently provider-native).
       */
      providerScoped: z.boolean(),
    }),
    z.object({
      action: z.literal("remove"),
      name: z.string().min(1),
      path: z.string().min(1),
    }),
  ],
);
export type ProvidersSkillsMutateAction = z.infer<
  typeof providersSkillsMutateActionSchema
>;

export const providersSkillsMutateRequestSchema =
  withProviderNativeScopeInvariant(
    providerNativeScopeTupleBaseSchema.extend({
      mutation: providersSkillsMutateActionSchema,
    }),
  );
export type ProvidersSkillsMutateRequest = z.infer<
  typeof providersSkillsMutateRequestSchema
>;

export const providersSkillsMutateResponseSchema = z.object({
  skills: z.array(providerSkillSchema),
});
export type ProvidersSkillsMutateResponse = z.infer<
  typeof providersSkillsMutateResponseSchema
>;
