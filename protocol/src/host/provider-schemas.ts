/**
 * Schemas for the `providers.*` host RPC surface. Manages the CLI binary
 * Traycer runs for each provider (Codex / Claude Code / OpenCode).
 *
 * Each provider exposes a set of candidates - the host-bundled binary, the
 * binary auto-discovered on PATH (resolved to its real absolute path), and
 * any custom paths the user added. The user selects one via a radio in
 * Settings → Providers; the selection + custom paths + enabled flag persist
 * per-device (== per-host) in
 * `~/.traycer/host/config/provider-overrides.json`.
 */
import { z } from "zod";
import type { TuiHarnessId } from "@traycer/protocol/host/agent/shared";
import {
  providerIdSchema,
  providerIdSchemaV10,
  providerIdSchemaV20,
  type ProviderId,
  type ProviderIdV10,
  type ProviderIdV20,
} from "./provider-ids";
import {
  DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  nativeAuthActionSchema,
  nativeAuthCancelContextSchema,
  nativeAuthPollContextSchema,
  nativeAuthResultSchema,
  nativeListQuerySchema,
  nativeListResultSchema,
  nativeMutationResultSchema,
  nativeMutationSchema,
  providerNativeCapabilitiesSchema,
  type NativeAuthAction,
  type NativeAuthCancelContext,
  type NativeAuthPollContext,
  type NativeAuthResult,
  type NativeListQuery,
  type NativeListResult,
  type NativeMutation,
  type NativeMutationResult,
  type ProviderNativeCapabilities,
} from "./provider-native-schemas";

export {
  providerIdSchema,
  providerIdSchemaV10,
  providerIdSchemaV20,
  type ProviderId,
  type ProviderIdV10,
  type ProviderIdV20,
};

/** Human-readable provider names, shared by the host and the GUI. */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  traycer: "Traycer",
  grok: "Grok",
  qwen: "Qwen Code",
  kiro: "Kiro",
  droid: "Droid",
  kimi: "Kimi",
  copilot: "Copilot",
  kilocode: "Kilo Code",
  openrouter: "OpenRouter",
  amp: "Amp",
};

/**
 * Canonical TUI-harness-id → provider-overrides-id map. The harness layer uses
 * `claude`; the provider-CLI config (Settings, `provider-overrides.json`) uses
 * `claude-code`. Single source of truth shared by the host's
 * `harnessIdToProviderId` and the GUI launch picker's args pre-fill, so the
 * two can't drift.
 */
export const TUI_HARNESS_ID_TO_PROVIDER_ID: Record<TuiHarnessId, ProviderId> = {
  claude: "claude-code",
  codex: "codex",
  opencode: "opencode",
  cursor: "cursor",
};

export const providerSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bundled") }),
  z.object({ kind: z.literal("path") }),
  z.object({ kind: z.literal("custom"), path: z.string() }),
]);
export type ProviderSelection = z.infer<typeof providerSelectionSchema>;

export const providerCliCandidateSchema = z.object({
  kind: z.enum(["bundled", "path", "custom"]),
  // bundled: resolved bundled path or "" when not installed.
  // path/custom: absolute path to the binary.
  path: z.string(),
  version: z.string().nullable(),
  available: z.boolean(),
  // True while the version is still being probed in the background; the
  // client re-fetches until it flips false.
  versionPending: z.boolean(),
});
export type ProviderCliCandidate = z.infer<typeof providerCliCandidateSchema>;

export const PROVIDER_AUTH_STATUS_SCHEMA_V10 = z.enum([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ProviderAuthStatusV10 = z.infer<
  typeof PROVIDER_AUTH_STATUS_SCHEMA_V10
>;

export const PROVIDER_AUTH_SCHEMA_V10 = z.object({
  status: PROVIDER_AUTH_STATUS_SCHEMA_V10,
  badgeText: z.string().nullable(),
  label: z.string().nullable(),
  detail: z.string().nullable(),
});
export type ProviderAuthV10 = z.infer<typeof PROVIDER_AUTH_SCHEMA_V10>;

export const PROVIDER_AUTH_STATUS_SCHEMA_V20 = z.enum([
  "authenticated",
  "unauthenticated",
  "configured",
  "unavailable",
  "unknown",
]);
export const PROVIDER_AUTH_STATUS_SCHEMA = PROVIDER_AUTH_STATUS_SCHEMA_V20;
export type ProviderAuthStatusV20 = z.infer<
  typeof PROVIDER_AUTH_STATUS_SCHEMA_V20
>;
export type ProviderAuthStatus = ProviderAuthStatusV20;

export const PROVIDER_AUTH_SCHEMA_V20 = z.object({
  status: PROVIDER_AUTH_STATUS_SCHEMA_V20,
  badgeText: z.string().nullable(),
  label: z.string().nullable(),
  detail: z.string().nullable(),
});
export const PROVIDER_AUTH_SCHEMA = PROVIDER_AUTH_SCHEMA_V20;
export type ProviderAuthV20 = z.infer<typeof PROVIDER_AUTH_SCHEMA_V20>;
export type ProviderAuth = ProviderAuthV20;

export const UNKNOWN_PROVIDER_AUTH: ProviderAuth = {
  status: "unknown",
  badgeText: null,
  label: null,
  detail: null,
};

/**
 * Definitive signed-out verdict. Written by the host's auth poison and the
 * probe-less `providers.list` path the instant a credential failure is detected,
 * so the re-auth gate flips without waiting out the cache TTL.
 */
export const UNAUTHENTICATED_PROVIDER_AUTH: ProviderAuth = {
  status: "unauthenticated",
  badgeText: null,
  label: null,
  detail: null,
};

/**
 * Who turned a provider off, and when. Recorded on disable, cleared (null) on
 * enable. The host is single-user today, so this is currently always the
 * local user - captured now for the future cross-user host.
 */
export const providerDisabledBySchema = z.object({
  userId: z.string(),
  handle: z.string().nullable(),
  at: z.number(),
});
export type ProviderDisabledBy = z.infer<typeof providerDisabledBySchema>;

/**
 * API-key state for a provider. Only providers authenticated by an API key
 * (Cursor, whose `@cursor/sdk` runtime needs `CURSOR_API_KEY`) set
 * `supported: true`; the CLI-login providers leave it false and the GUI hides
 * the key field. The raw key is NEVER returned over RPC - only whether one is
 * resolvable and where it came from (`stored` = saved in Settings, `env` =
 * the user's login-shell `CURSOR_API_KEY`).
 */
export const providerApiKeyStateSchema = z.object({
  supported: z.boolean(),
  configured: z.boolean(),
  source: z.enum(["stored", "env"]).nullable(),
});
export type ProviderApiKeyState = z.infer<typeof providerApiKeyStateSchema>;

/**
 * A single environment-variable override applied when the host spawns this
 * provider's harness. `value: null` is an explicit *unset* (drop a variable the
 * spawned process would otherwise inherit from the user's shell); a string sets
 * it. Persisted per-provider (== per-host) in `provider-overrides.json`.
 */
export const providerEnvOverrideSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
});
export type ProviderEnvOverride = z.infer<typeof providerEnvOverrideSchema>;

/**
 * Describes how a user can re-authenticate a provider CLI from the in-chat
 * re-auth banner. The banner only appears for providers that have a web login
 * (so a sign-out is genuinely recoverable in-app); for those it offers a
 * browser-OAuth login (`oauthArgs`) AND/OR pasting a fresh credential into one
 * of `token.vars` (an API key / OAuth token, written as a per-provider env
 * override). API-key-only providers with no web login (Cursor) have no banner at
 * all - their capability is null and a bad key surfaces as a generic error row.
 *
 * Note this is distinct from how a *rejected* credential surfaces: a key/token
 * the host can't verify renders a generic error row (see the harness
 * adapters), not this reconnect affordance.
 */
export const providerLoginCapabilitySchema = z.object({
  /** Args to pass to the provider binary for browser-OAuth login, or null if unsupported. */
  oauthArgs: z.array(z.string()).nullable(),
  /**
   * Credential env vars the user can paste a key/token into (e.g.
   * `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`), written via
   * `providers.setEnvOverride`. Null when paste-to-reconnect is unsupported.
   */
  token: z.object({ vars: z.array(z.string()) }).nullable(),
});
export type ProviderLoginCapability = z.infer<
  typeof providerLoginCapabilitySchema
>;

const providerCliStateBaseShape = {
  enabled: z.boolean(),
  disabledBy: providerDisabledBySchema.nullable(),
  selected: providerSelectionSchema,
  candidates: z.array(providerCliCandidateSchema),
  authPending: z.boolean(),
  checkedAt: z.number().nullable(),
  apiKey: providerApiKeyStateSchema,
  // Extra CLI arguments the user wants appended when launching this provider
  // as a terminal agent (the host tokenizes and appends them to the spawned
  // argv). Only meaningful for terminal-agent-capable providers; "" when unset.
  terminalAgentArgs: z.string().catch(""),
  // Per-provider environment overrides applied when the host spawns this
  // provider's harness. Sorted by key for stable rendering; `[]` when unset.
  envOverrides: z.array(providerEnvOverrideSchema).catch([]),
  // Login/re-auth options for this provider. Null for providers that have no
  // supported login flow (cursor, traycer) or where login capability is not
  // yet modelled. `.catch(null)` tolerates old host builds that omit the field.
  loginCapability: providerLoginCapabilitySchema.nullable().catch(null),
  // True while the host's shell-env probe for this provider is still running
  // in the background (e.g. PATH binary discovery or env-sourced API key
  // lookup). The client re-fetches until it flips false. A pending row always
  // carries `available: false` semantically (don't trust candidates/auth yet).
  // `.catch(false)` tolerates old host builds that omit the field — old
  // behavior treats every verdict as final, which is correct for old hosts.
  availabilityPending: z.boolean().catch(false),
};

const providerCliStateBaseShapeV10 = {
  enabled: z.boolean(),
  disabledBy: providerDisabledBySchema.nullable(),
  selected: providerSelectionSchema,
  candidates: z.array(providerCliCandidateSchema),
  authPending: z.boolean(),
  checkedAt: z.number().nullable(),
  apiKey: providerApiKeyStateSchema,
  terminalAgentArgs: z.string().catch(""),
  envOverrides: z.array(providerEnvOverrideSchema).catch([]),
  loginCapability: providerLoginCapabilitySchema.nullable().catch(null),
};

/**
 * Latest provider CLI state (providers.list@3.1 and state-returning
 * providers.*@2.1). Adds `nativeCapabilities` — per-capability facts the UI
 * renders MCP/plugins/skills tabs from. `.catch(DEFAULT)` tolerates old host
 * builds that omit the field when an old-host response is parsed on a new
 * client.
 */
export const providerCliStateSchema = z.object({
  providerId: providerIdSchema,
  ...providerCliStateBaseShape,
  auth: PROVIDER_AUTH_SCHEMA_V20,
  nativeCapabilities: providerNativeCapabilitiesSchema.catch(
    DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  ),
});
export type ProviderCliState = z.infer<typeof providerCliStateSchema>;

/**
 * `providers.list@3.1` request. Optional `native` list/discover query folds
 * the unreleased mcp/plugins/skills list verbs onto this carrier. Classic
 * callers omit it (upgrade defaults to null).
 */
export const providersListRequestSchema = z.object({
  forceAuthRefresh: z.boolean().optional(),
  native: nativeListQuerySchema.nullable().default(null),
});
export type ProvidersListRequest = z.infer<typeof providersListRequestSchema>;

/** Frozen `providers.list@3.0` request (no native field). */
export const providersListRequestSchemaV30 = z.object({
  forceAuthRefresh: z.boolean().optional(),
});
export type ProvidersListRequestV30 = z.infer<
  typeof providersListRequestSchemaV30
>;

/**
 * `providers.list@3.1` response. Always returns the classic provider catalog;
 * when the request carried a `native` query, `native` holds the list/discover
 * result (or a typed native error). Classic callers receive `native: null`.
 */
export const providersListResponseSchema = z.object({
  providers: z.array(providerCliStateSchema),
  native: nativeListResultSchema.nullable().default(null),
});
export type ProvidersListResponse = z.infer<typeof providersListResponseSchema>;

// ── Frozen protocol-v3.0 provider state + list response (before
// nativeCapabilities / native list carrier). `providers.list@3.0` shipped with
// Amp but without the native-settings descriptor; @3.1 adds both with an
// upgrade bridge.
export const providerCliStateSchemaV30 = z.object({
  providerId: providerIdSchema,
  ...providerCliStateBaseShape,
  auth: PROVIDER_AUTH_SCHEMA_V20,
});
export type ProviderCliStateV30 = z.infer<typeof providerCliStateSchemaV30>;
export const providersListResponseSchemaV30 = z.object({
  providers: z.array(providerCliStateSchemaV30),
});
export type ProvidersListResponseV30 = z.infer<
  typeof providersListResponseSchemaV30
>;

// ── Frozen protocol-v2.0 provider state + list response (before Amp) ───────
// `providers.list` always returns every provider; v2.0 shipped without Amp, so
// it is frozen here as actually shipped. The v3.0 line adds Amp and a v3→v2
// (and v3→v1) downgrade bridge filters it for older callers. Do not add new
// providers here - use the existing v3 bridge. Frozen WITHOUT
// nativeCapabilities (that rides @3.1 / @2.1). `providerIdSchemaV20` is ONLY
// for this list@2.0 response shape — mutation @2.0 responses are amp-inclusive
// (tag-exact host-v1.1.5); see providerCliStateSchemaMutationV20 below.
export const providerCliStateSchemaV20 = z.object({
  providerId: providerIdSchemaV20,
  ...providerCliStateBaseShape,
  auth: PROVIDER_AUTH_SCHEMA_V20,
});
export type ProviderCliStateV20 = z.infer<typeof providerCliStateSchemaV20>;
export const providersListResponseSchemaV20 = z.object({
  providers: z.array(providerCliStateSchemaV20),
});
export type ProvidersListResponseV20 = z.infer<
  typeof providersListResponseSchemaV20
>;

/**
 * Tag-exact host-v1.1.5 shape for state-returning mutation @2.0 responses.
 * Amp-inclusive (the released @2.0 mutation surface accepted amp); no
 * `nativeCapabilities` (@2.1-only). Distinct from list@2.0's pre-amp freeze.
 * Oracle: `git show host-v1.1.5:protocol/src/host/provider-schemas.ts` —
 * mutation responses reused the then-latest amp-inclusive state schema.
 */
export const providerCliStateSchemaMutationV20 = z.object({
  providerId: providerIdSchema,
  ...providerCliStateBaseShape,
  auth: PROVIDER_AUTH_SCHEMA_V20,
});
export type ProviderCliStateMutationV20 = z.infer<
  typeof providerCliStateSchemaMutationV20
>;

// Frozen protocol-v1.0 provider state + list response. The v2.0 line of
// `providers.list` adds ACP GUI harness providers; the v2→v1 bridge filters
// them for v1.0 callers.
export const providerCliStateSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  ...providerCliStateBaseShapeV10,
  auth: PROVIDER_AUTH_SCHEMA_V10,
});
export type ProviderCliStateV10 = z.infer<typeof providerCliStateSchemaV10>;
export const providersListResponseSchemaV10 = z.object({
  providers: z.array(providerCliStateSchemaV10),
});
export type ProvidersListResponseV10 = z.infer<
  typeof providersListResponseSchemaV10
>;

export {
  DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  type ProviderNativeCapabilities,
};

export const providersSetSelectionRequestSchema = z.object({
  providerId: providerIdSchema,
  selection: providerSelectionSchema,
});
export const providersSetSelectionRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  selection: providerSelectionSchema,
});
export type ProvidersSetSelectionRequest = z.infer<
  typeof providersSetSelectionRequestSchema
>;

export const providersSetSelectionResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersSetSelectionResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersSetSelectionResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersSetSelectionResponse = z.infer<
  typeof providersSetSelectionResponseSchema
>;

export const providersAddCustomPathRequestSchema = z.object({
  providerId: providerIdSchema,
  path: z.string().min(1),
});
export const providersAddCustomPathRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  path: z.string().min(1),
});
export type ProvidersAddCustomPathRequest = z.infer<
  typeof providersAddCustomPathRequestSchema
>;

export const providersAddCustomPathResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersAddCustomPathResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersAddCustomPathResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersAddCustomPathResponse = z.infer<
  typeof providersAddCustomPathResponseSchema
>;

export const providersRemoveCustomPathRequestSchema = z.object({
  providerId: providerIdSchema,
  path: z.string().min(1),
});
export const providersRemoveCustomPathRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  path: z.string().min(1),
});
export type ProvidersRemoveCustomPathRequest = z.infer<
  typeof providersRemoveCustomPathRequestSchema
>;

export const providersRemoveCustomPathResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersRemoveCustomPathResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersRemoveCustomPathResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersRemoveCustomPathResponse = z.infer<
  typeof providersRemoveCustomPathResponseSchema
>;

/**
 * Frozen `providers.setEnabled@2.0` request (classic enable/disable only).
 */
export const providersSetEnabledRequestSchemaV20 = z.object({
  providerId: providerIdSchema,
  enabled: z.boolean(),
});
export type ProvidersSetEnabledRequestV20 = z.infer<
  typeof providersSetEnabledRequestSchemaV20
>;

/**
 * `providers.setEnabled@2.1` request. Object-preserving envelope: classic
 * callers set `enabled` with `native: null`; native mutations set `native`
 * with `enabled: null`. Exactly one of the two must be non-null (runtime XOR).
 */
export const providersSetEnabledRequestSchema = z
  .object({
    providerId: providerIdSchema,
    /**
     * Classic enable/disable arm. Null when `native` is set. Defaults to null
     * when omitted so native-only callers can send just `{providerId, native}`.
     */
    enabled: z.boolean().nullable().default(null),
    /**
     * Native mutation arm. Null for classic enable/disable. Defaults to null
     * when omitted so classic callers can send just `{providerId, enabled}`.
     */
    native: nativeMutationSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    const hasEnabled = value.enabled !== null;
    const hasNative = value.native !== null;
    if (hasEnabled === hasNative) {
      ctx.addIssue({
        code: "custom",
        path: hasEnabled ? ["native"] : ["enabled"],
        message:
          'providers.setEnabled@2.1 requires exactly one of "enabled" or "native"',
      });
    }
  });
export const providersSetEnabledRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  enabled: z.boolean(),
});
export type ProvidersSetEnabledRequest = z.infer<
  typeof providersSetEnabledRequestSchema
>;

/**
 * `providers.setEnabled@2.1` response. Always returns classic `state`; native
 * mutations also populate `native` (ok payload or typed error). Classic
 * enable/disable returns `native: null`.
 */
export const providersSetEnabledResponseSchema = z.object({
  state: providerCliStateSchema,
  native: nativeMutationResultSchema.nullable().default(null),
});
export const providersSetEnabledResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersSetEnabledResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersSetEnabledResponse = z.infer<
  typeof providersSetEnabledResponseSchema
>;

export const providersSetApiKeyRequestSchema = z.object({
  providerId: providerIdSchema,
  apiKey: z.string().min(1),
});
export const providersSetApiKeyRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  apiKey: z.string().min(1),
});
export type ProvidersSetApiKeyRequest = z.infer<
  typeof providersSetApiKeyRequestSchema
>;

export const providersSetApiKeyResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersSetApiKeyResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersSetApiKeyResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersSetApiKeyResponse = z.infer<
  typeof providersSetApiKeyResponseSchema
>;

export const providersClearApiKeyRequestSchema = z.object({
  providerId: providerIdSchema,
});
export const providersClearApiKeyRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
});
export type ProvidersClearApiKeyRequest = z.infer<
  typeof providersClearApiKeyRequestSchema
>;

export const providersClearApiKeyResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersClearApiKeyResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersClearApiKeyResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersClearApiKeyResponse = z.infer<
  typeof providersClearApiKeyResponseSchema
>;

export const providersSetTerminalAgentArgsRequestSchema = z.object({
  providerId: providerIdSchema,
  // Empty string clears the saved override.
  terminalAgentArgs: z.string(),
});
export const providersSetTerminalAgentArgsRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  terminalAgentArgs: z.string(),
});
export type ProvidersSetTerminalAgentArgsRequest = z.infer<
  typeof providersSetTerminalAgentArgsRequestSchema
>;

export const providersSetTerminalAgentArgsResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersSetTerminalAgentArgsResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersSetTerminalAgentArgsResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersSetTerminalAgentArgsResponse = z.infer<
  typeof providersSetTerminalAgentArgsResponseSchema
>;

export const providersSetEnvOverrideRequestSchema = z.object({
  providerId: providerIdSchema,
  key: z.string().min(1),
  // null = explicit unset; a string sets the value.
  value: z.string().nullable(),
});
export const providersSetEnvOverrideRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  key: z.string().min(1),
  value: z.string().nullable(),
});
export type ProvidersSetEnvOverrideRequest = z.infer<
  typeof providersSetEnvOverrideRequestSchema
>;

export const providersSetEnvOverrideResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersSetEnvOverrideResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersSetEnvOverrideResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersSetEnvOverrideResponse = z.infer<
  typeof providersSetEnvOverrideResponseSchema
>;

export const providersDeleteEnvOverrideRequestSchema = z.object({
  providerId: providerIdSchema,
  key: z.string().min(1),
});
export const providersDeleteEnvOverrideRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
  key: z.string().min(1),
});
export type ProvidersDeleteEnvOverrideRequest = z.infer<
  typeof providersDeleteEnvOverrideRequestSchema
>;

export const providersDeleteEnvOverrideResponseSchema = z.object({
  state: providerCliStateSchema,
});
export const providersDeleteEnvOverrideResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20,
});
export const providersDeleteEnvOverrideResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10,
});
export type ProvidersDeleteEnvOverrideResponse = z.infer<
  typeof providersDeleteEnvOverrideResponseSchema
>;

export const providersDetectVersionRequestSchema = z.object({
  candidatePath: z.string().min(1),
});
export type ProvidersDetectVersionRequest = z.infer<
  typeof providersDetectVersionRequestSchema
>;

export const providersDetectVersionResponseSchema = z.object({
  executable: z.boolean(),
  version: z.string().nullable(),
});
export type ProvidersDetectVersionResponse = z.infer<
  typeof providersDetectVersionResponseSchema
>;

/**
 * Frozen `providers.startLogin@1.0` request/response (classic provider OAuth).
 */
export const providersStartLoginRequestSchemaV10 = z.object({
  providerId: providerIdSchema,
});
export type ProvidersStartLoginRequestV10 = z.infer<
  typeof providersStartLoginRequestSchemaV10
>;

export const providersStartLoginResponseSchemaV10 = z.object({
  url: z.string().nullable(),
  started: z.boolean(),
});
export type ProvidersStartLoginResponseV10 = z.infer<
  typeof providersStartLoginResponseSchemaV10
>;

/**
 * `providers.startLogin@1.1` request. Classic callers set `mcpAuth: null`;
 * MCP auth folds the full NativeAuthAction set onto this carrier.
 */
export const providersStartLoginRequestSchema = z.object({
  providerId: providerIdSchema,
  mcpAuth: nativeAuthActionSchema.nullable().default(null),
});
export type ProvidersStartLoginRequest = z.infer<
  typeof providersStartLoginRequestSchema
>;

/**
 * `providers.startLogin@1.1` response. Classic arm returns url/started with
 * `mcpAuth: null`; MCP auth populates `mcpAuth` with the action result.
 */
export const providersStartLoginResponseSchema = z.object({
  url: z.string().nullable(),
  started: z.boolean(),
  mcpAuth: nativeAuthResultSchema.nullable().default(null),
});
export type ProvidersStartLoginResponse = z.infer<
  typeof providersStartLoginResponseSchema
>;

/**
 * Frozen `providers.awaitLogin@2.0` request (classic provider-child await).
 */
export const providersAwaitLoginRequestSchemaV20 = z.object({
  providerId: providerIdSchema,
});
export type ProvidersAwaitLoginRequestV20 = z.infer<
  typeof providersAwaitLoginRequestSchemaV20
>;

/**
 * `providers.awaitLogin@2.1` request. With `mcpAuth` set this is a **bounded
 * status poll** (well under the 30s unary frame deadline), never the classic
 * provider-child long poll. Host pending-auth registry (R02) owns concurrency.
 */
export const providersAwaitLoginRequestSchema = z.object({
  providerId: providerIdSchema,
  mcpAuth: nativeAuthPollContextSchema.nullable().default(null),
});
export const providersAwaitLoginRequestSchemaV10 = z.strictObject({
  providerId: providerIdSchemaV10,
});
export type ProvidersAwaitLoginRequest = z.infer<
  typeof providersAwaitLoginRequestSchema
>;

/**
 * `providers.awaitLogin@2.1` response. Classic arm returns re-probed `state`
 * with `mcpAuth: null`; MCP poll returns status in `mcpAuth`.
 */
export const providersAwaitLoginResponseSchema = z.object({
  // The provider's state after the login child closed and auth was re-probed.
  // Null when no login was in flight for this provider (nothing to await).
  state: providerCliStateSchema.nullable(),
  mcpAuth: nativeAuthResultSchema.nullable().default(null),
});
export const providersAwaitLoginResponseSchemaV20 = z.object({
  state: providerCliStateSchemaMutationV20.nullable(),
});
export const providersAwaitLoginResponseSchemaV10 = z.object({
  state: providerCliStateSchemaV10.nullable(),
});
export type ProvidersAwaitLoginResponse = z.infer<
  typeof providersAwaitLoginResponseSchema
>;

/**
 * Frozen `providers.cancelLogin@1.0` request/response.
 */
export const providersCancelLoginRequestSchemaV10 = z.object({
  providerId: providerIdSchema,
});
export type ProvidersCancelLoginRequestV10 = z.infer<
  typeof providersCancelLoginRequestSchemaV10
>;

export const providersCancelLoginResponseSchemaV10 = z.object({
  cancelled: z.boolean(),
});
export type ProvidersCancelLoginResponseV10 = z.infer<
  typeof providersCancelLoginResponseSchemaV10
>;

/**
 * `providers.cancelLogin@1.1` request. MCP cancel folds server context onto
 * this carrier; classic callers set `mcpAuth: null`.
 */
export const providersCancelLoginRequestSchema = z.object({
  providerId: providerIdSchema,
  mcpAuth: nativeAuthCancelContextSchema.nullable().default(null),
});
export type ProvidersCancelLoginRequest = z.infer<
  typeof providersCancelLoginRequestSchema
>;

/**
 * `providers.cancelLogin@1.1` response. Classic arm returns cancelled with
 * `mcpAuth: null`; MCP cancel may return a typed auth result (e.g. done).
 */
export const providersCancelLoginResponseSchema = z.object({
  cancelled: z.boolean(),
  mcpAuth: nativeAuthResultSchema.nullable().default(null),
});
export type ProvidersCancelLoginResponse = z.infer<
  typeof providersCancelLoginResponseSchema
>;

export type {
  NativeAuthAction,
  NativeAuthCancelContext,
  NativeAuthPollContext,
  NativeAuthResult,
  NativeListQuery,
  NativeListResult,
  NativeMutation,
  NativeMutationResult,
};

export function downgradeProviderAuthV20ToV10(
  auth: ProviderAuthV20,
): ProviderAuthV10 {
  switch (auth.status) {
    case "configured":
    case "unavailable":
      return { ...auth, status: "unknown" };
    case "authenticated":
      return { ...auth, status: "authenticated" };
    case "unauthenticated":
      return { ...auth, status: "unauthenticated" };
    case "unknown":
      return { ...auth, status: "unknown" };
  }
}

// Accepts any latest-shaped state and downgrades it to the frozen v1.0 shape.
// A provider outside v1.0's id set (ACP GUI harnesses, Amp) simply fails the
// `providerCliStateSchemaV10` parse below and is filtered by the caller.
export function downgradeProviderCliStateToV10(
  state:
    | ProviderCliState
    | ProviderCliStateV30
    | ProviderCliStateV20
    | ProviderCliStateMutationV20,
): ProviderCliStateV10 | null {
  // `providerCliStateSchemaV10` is a `z.strictObject`, so it REJECTS any key it
  // doesn't model. Drop post-v1.0 fields before the parse — otherwise every
  // provider fails the parse and silently vanishes from the downgraded payload
  // for v1.0 clients.
  // - `availabilityPending` (v2.0+)
  // - `nativeCapabilities` (v3.1 / v2.1+) — CRITICAL silent-data-loss trap
  const { availabilityPending: _availabilityPending, ...rest } = state;
  const { nativeCapabilities: _nativeCapabilities, ...withoutNative } =
    rest as typeof rest & {
      nativeCapabilities?: ProviderNativeCapabilities;
    };
  const parsed = providerCliStateSchemaV10.safeParse({
    ...withoutNative,
    auth: downgradeProviderAuthV20ToV10(state.auth),
  });
  return parsed.success ? parsed.data : null;
}

// Downgrades a latest-shaped provider-state list to the frozen list@2.0 shape,
// dropping Amp (or any future post-v2.0 provider) and stripping
// `nativeCapabilities` so an already-shipped v2.0 client's decode never sees
// them. Zod object parse strips unknown keys. LIST only — mutations use
// {@link downgradeProviderCliStateToMutationV20}.
export function downgradeProviderCliStateListToV20(
  states: readonly (ProviderCliState | ProviderCliStateV30)[],
): ProviderCliStateV20[] {
  return states.flatMap((state) => {
    const parsed = providerCliStateSchemaV20.safeParse(state);
    return parsed.success ? [parsed.data] : [];
  });
}

// Downgrades latest (v3.1) state to frozen v3.0 (no nativeCapabilities).
export function downgradeProviderCliStateToV30(
  state: ProviderCliState,
): ProviderCliStateV30 {
  const { nativeCapabilities: _nativeCapabilities, ...rest } = state;
  return providerCliStateSchemaV30.parse(rest);
}

export function downgradeProviderCliStateListToV30(
  states: readonly ProviderCliState[],
): ProviderCliStateV30[] {
  return states.map(downgradeProviderCliStateToV30);
}

// Downgrades latest state to frozen list@2.0 (drops Amp + nativeCapabilities).
export function downgradeProviderCliStateToV20(
  state: ProviderCliState | ProviderCliStateV30,
): ProviderCliStateV20 | null {
  const parsed = providerCliStateSchemaV20.safeParse(state);
  return parsed.success ? parsed.data : null;
}

/**
 * Downgrades latest state to tag-exact mutation@2.0 (amp-inclusive, no
 * nativeCapabilities). Used by state-returning mutation 2.1→2.0 bridges.
 */
export function downgradeProviderCliStateToMutationV20(
  state: ProviderCliState | ProviderCliStateV30,
): ProviderCliStateMutationV20 {
  const { nativeCapabilities: _nativeCapabilities, ...rest } =
    state as ProviderCliState;
  return providerCliStateSchemaMutationV20.parse(rest);
}

export function upgradeProviderCliStateV10ToV20(
  state: ProviderCliStateV10,
): ProviderCliStateV20 {
  return providerCliStateSchemaV20.parse({
    ...state,
    availabilityPending: false,
  });
}

/**
 * Upgrade a tag-exact mutation@2.0 state (amp-inclusive) to latest by attaching
 * the default descriptor.
 */
export function upgradeProviderCliStateMutationV20ToLatest(
  state: ProviderCliStateMutationV20,
): ProviderCliState {
  return providerCliStateSchema.parse({
    ...state,
    nativeCapabilities: DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  });
}

/** Upgrade frozen list@2.0 / v3.0 state to latest by attaching the default descriptor. */
export function upgradeProviderCliStateToLatest(
  state: ProviderCliStateV20 | ProviderCliStateV30 | ProviderCliStateMutationV20,
): ProviderCliState {
  return providerCliStateSchema.parse({
    ...state,
    nativeCapabilities: DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  });
}

export function upgradeProviderCliStateListToLatest(
  states: readonly (
    | ProviderCliStateV20
    | ProviderCliStateV30
    | ProviderCliStateMutationV20
  )[],
): ProviderCliState[] {
  return states.map(upgradeProviderCliStateToLatest);
}
