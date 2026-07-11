import "../../../../../__tests__/test-browser-apis";
import type {
  ProviderAuth,
  ProviderCliCandidate,
  ProviderCliState,
  ProviderSelection,
} from "@traycer/protocol/host/provider-schemas";
import { DEFAULT_PROVIDER_NATIVE_CAPABILITIES } from "@traycer/protocol/host/provider-native-schemas";
import type { ProviderNativeCapabilities } from "@traycer/protocol/host/provider-native-schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProvidersFocusStore } from "@/stores/settings/providers-focus-store";

// Radix Tabs activates on mouseDown (not click). Helper keeps assertions short.
function selectTab(name: string): void {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
}

const providerMocks = vi.hoisted(() => ({
  listResult: {
    data: { providers: [] as ProviderCliState[] },
    isPending: false,
    isError: false,
    isFetching: false,
  },
  setSelectionMutate: vi.fn(),
  addCustomPathMutate: vi.fn(),
  removeCustomPathMutate: vi.fn(),
  setEnabledMutate: vi.fn(),
  setApiKeyMutate: vi.fn(),
  clearApiKeyMutate: vi.fn(),
  setTerminalAgentArgsMutate: vi.fn(),
  setEnvOverrideMutate: vi.fn(),
  deleteEnvOverrideMutate: vi.fn(),
  refreshProviders: vi.fn(() => Promise.resolve()),
  openExternalLink: vi.fn(),
}));

vi.mock("@/hooks/providers/use-providers-list-query", () => ({
  useProvidersList: () => providerMocks.listResult,
}));

vi.mock("@/hooks/providers/use-providers-plugins-list-query", () => ({
  useProvidersPluginsList: () => ({
    data: { plugins: [] },
    isPending: false,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/hooks/providers/use-providers-plugins-mutate-mutation", () => ({
  useProvidersPluginsMutate: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-skills-list-query", () => ({
  useProvidersSkillsList: () => ({
    data: { skills: [] },
    isPending: false,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/hooks/providers/use-providers-skills-mutate-mutation", () => ({
  useProvidersSkillsMutate: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// Sibling ticket 11 owns the MCP tab; mock its hooks so panel tests stay isolated.
vi.mock("@/hooks/providers/use-providers-mcp-list-query", () => ({
  useProvidersMcpList: () => ({
    data: { servers: [] },
    isPending: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/providers/use-providers-mcp-mutate-mutation", () => ({
  useProvidersMcpMutate: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-mcp-discover-mutation", () => ({
  useProvidersMcpDiscover: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-mcp-auth-mutation", () => ({
  useProvidersMcpAuth: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-set-selection-mutation", () => ({
  useProvidersSetSelection: () => ({
    mutate: providerMocks.setSelectionMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-add-custom-path-mutation", () => ({
  useProvidersAddCustomPath: () => ({
    mutate: providerMocks.addCustomPathMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-remove-custom-path-mutation", () => ({
  useProvidersRemoveCustomPath: () => ({
    mutate: providerMocks.removeCustomPathMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-set-enabled-mutation", () => ({
  useProvidersSetEnabled: () => ({
    mutate: providerMocks.setEnabledMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-set-api-key-mutation", () => ({
  useProvidersSetApiKey: () => ({
    mutate: providerMocks.setApiKeyMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-clear-api-key-mutation", () => ({
  useProvidersClearApiKey: () => ({
    mutate: providerMocks.clearApiKeyMutate,
    isPending: false,
  }),
}));

vi.mock(
  "@/hooks/providers/use-providers-set-terminal-agent-args-mutation",
  () => ({
    useProvidersSetTerminalAgentArgs: () => ({
      mutate: providerMocks.setTerminalAgentArgsMutate,
      isPending: false,
    }),
  }),
);

vi.mock("@/hooks/providers/use-providers-set-env-override-mutation", () => ({
  useProvidersSetEnvOverride: () => ({
    mutate: providerMocks.setEnvOverrideMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-delete-env-override-mutation", () => ({
  useProvidersDeleteEnvOverride: () => ({
    mutate: providerMocks.deleteEnvOverrideMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-detect-version-query", () => ({
  useProvidersDetectVersion: () => ({
    isFetching: false,
    data: undefined,
  }),
}));

vi.mock("@/hooks/harnesses/use-gui-harness-catalog", () => ({
  useGuiHarnessesQuery: () => ({
    data: {
      harnesses: [
        { id: "claude", modes: ["gui", "tui"] },
        { id: "codex", modes: ["gui", "tui"] },
      ],
    },
  }),
}));

vi.mock("@/hooks/providers/use-refresh-providers", () => ({
  useRefreshProviders: () => providerMocks.refreshProviders,
}));

vi.mock("@/providers/use-runner-host", () => ({
  useRunnerHost: () => ({
    openExternalLink: providerMocks.openExternalLink,
  }),
}));

vi.mock("@/hooks/runner/use-open-external-link-mutation", () => ({
  useRunnerOpenExternalLink: () => ({
    mutate: providerMocks.openExternalLink,
  }),
}));

// MCP Project scope resolves workspaces via host query; this harness has no
// QueryClient, so stub a stable empty host-resolved set.
vi.mock("@/hooks/workspace/use-resolved-workspace-folders-query", () => ({
  useResolvedWorkspaceFolders: () => ({
    folders: [],
    isLoading: false,
    isFetching: false,
  }),
}));

vi.mock("@/lib/host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/host")>();
  return {
    ...actual,
    useHostBinding: () => null,
    useHostClient: () => null,
  };
});

vi.mock("@/hooks/host/use-reactive-active-host-id", () => ({
  useReactiveActiveHostId: () => "host-1",
}));

// The Traycer provider mounts the subscription card; stub its credits query so
// the real AuthService (which needs a host-runtime provider) isn't invoked.
vi.mock("@/hooks/auth/use-auth-user-query", () => ({
  useAuthUser: () => ({
    data: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve({}),
  }),
}));

// Pure side-effect hook in the Traycer subscription card; no render output, and
// it needs a QueryClient this harness doesn't set up.
vi.mock("@/hooks/auth/use-refresh-credits-on-traycer-turn", () => ({
  useRefreshCreditsOnTraycerTurn: () => {},
}));

// Rate-limit usage query + its refresh hook (RateLimitView). Same reason:
// no host client/QueryClient in this harness.
vi.mock("@/hooks/host/use-host-rate-limit-usage-query", () => ({
  useHostRateLimitUsageQuery: () => ({ data: undefined }),
}));
vi.mock("@/hooks/host/use-refresh-rate-limit-usage-on-traycer-turn", () => ({
  useRefreshRateLimitUsageOnTraycerTurn: () => {},
}));

// Provider rate-limit query + its refresh hook (ProviderRateLimitForProvider,
// mounted for every codex/claude-code provider row). Same reason: no host
// client/QueryClient in this harness.
vi.mock("@/hooks/host/use-host-provider-rate-limits-query", () => ({
  useHostProviderRateLimitsQuery: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => Promise.resolve({}),
  }),
}));
vi.mock("@/hooks/host/use-refresh-provider-rate-limits-on-turn", () => ({
  useRefreshProviderRateLimitsOnTurn: () => {},
}));

// Host picker plumbing: a single active host and no transient client means
// the panel renders inline (no runtime-context re-provide), and `useHostBinding`
// returns null without a `<HostRuntimeProvider>`.
vi.mock("@/hooks/host/use-reactive-active-host-id", () => ({
  useReactiveActiveHostId: () => "local",
}));

vi.mock("@/hooks/host/use-host-directory-list-query", () => ({
  useHostDirectoryList: () => ({
    data: [
      {
        hostId: "local",
        label: "Local host",
        status: "available",
        websocketUrl: "ws://127.0.0.1:0",
      },
    ],
  }),
}));

vi.mock("@/hooks/host/use-host-client-for", () => ({
  useHostClientFor: () => null,
}));

import { ProvidersSettingsPanel } from "@/components/settings/panels/providers-settings-panel";
import { TooltipProvider } from "@/components/ui/tooltip";

const OPENCODE_CANDIDATES: readonly ProviderCliCandidate[] = [
  {
    kind: "bundled",
    path: "/bundled/opencode",
    version: "1.0.0",
    available: true,
    versionPending: false,
  },
  {
    kind: "path",
    path: "/usr/local/bin/opencode",
    version: "1.1.0",
    available: true,
    versionPending: false,
  },
];

function providerState(input: {
  readonly providerId: ProviderCliState["providerId"];
  readonly selected: ProviderSelection;
  readonly candidates: readonly ProviderCliCandidate[];
  readonly envOverrides: ProviderCliState["envOverrides"];
  readonly nativeCapabilities?: ProviderNativeCapabilities;
}): ProviderCliState {
  return {
    providerId: input.providerId,
    enabled: true,
    disabledBy: null,
    selected: input.selected,
    candidates: [...input.candidates],
    auth: {
      status: "authenticated",
      badgeText: null,
      label: null,
      detail: null,
    },
    authPending: false,
    checkedAt: null,
    apiKey: { supported: false, configured: false, source: null },
    terminalAgentArgs: "",
    envOverrides: [...input.envOverrides],
    loginCapability: null,
    availabilityPending: false,
    nativeCapabilities:
      input.nativeCapabilities ?? DEFAULT_PROVIDER_NATIVE_CAPABILITIES,
  };
}

function providerStateWithAuth(
  input: {
    readonly providerId: ProviderCliState["providerId"];
    readonly selected: ProviderSelection;
    readonly candidates: readonly ProviderCliCandidate[];
    readonly envOverrides: ProviderCliState["envOverrides"];
  },
  auth: ProviderAuth,
  authPending: boolean,
): ProviderCliState {
  return { ...providerState(input), auth, authPending };
}

const BOTH_SCOPES = ["global", "project"] as const;

const SAMPLE_MCP: NonNullable<ProviderNativeCapabilities["mcp"]> = {
  transports: ["stdio", "http"],
  authTypes: ["none", "header"],
  authActions: ["login", "logout"],
  actionScopes: {
    list: [...BOTH_SCOPES],
    add: [...BOTH_SCOPES],
    update: [...BOTH_SCOPES],
    remove: [...BOTH_SCOPES],
    toggleServer: [...BOTH_SCOPES],
    toggleTool: [...BOTH_SCOPES],
    discover: [...BOTH_SCOPES],
    auth: [...BOTH_SCOPES],
  },
  addServer: "cli",
  removeServer: "cli",
  updateServer: "patch",
  perToolBacking: "native",
  statusSource: "probe",
  toolsSource: "probe",
  schemasSource: "probe",
  instructionsSource: "probe",
  traycerSessionsOnlyEnforcement: false,
  stdioDegradeNotice: false,
  oauthDegradesToConfigOnly: true,
};

const FULL_TABS: ProviderNativeCapabilities = {
  supportedTabs: ["general", "env", "usage", "mcp", "plugins", "skills"],
  mcp: SAMPLE_MCP,
  plugins: {
    addModes: ["cli-source"],
    marketplaceBrowse: false,
    actionScopes: {
      list: ["global"],
      add: ["global"],
      remove: ["global"],
      setEnabled: ["global"],
    },
    traycerSessionToolsNotice: false,
  },
  skills: {
    actionScopes: {
      list: ["global"],
      add: ["global"],
      create: ["global"],
      import: [],
      remove: ["global"],
    },
  },
};

const CURSOR_TABS: ProviderNativeCapabilities = {
  supportedTabs: ["env", "mcp", "plugins", "skills"],
  mcp: {
    ...SAMPLE_MCP,
    perToolBacking: "degraded-server-level",
    instructionsSource: "none",
  },
  plugins: {
    addModes: ["read-only"],
    marketplaceBrowse: false,
    actionScopes: {
      list: ["global"],
      add: [],
      remove: [],
      setEnabled: [],
    },
    traycerSessionToolsNotice: false,
  },
  skills: {
    actionScopes: {
      list: ["global"],
      add: ["global"],
      create: ["global"],
      import: [],
      remove: ["global"],
    },
  },
};

const ENV_ONLY_TABS: ProviderNativeCapabilities = {
  supportedTabs: ["env"],
  mcp: null,
  plugins: null,
  skills: null,
};

describe("<ProvidersSettingsPanel />", () => {
  beforeEach(() => {
    useProvidersFocusStore.setState({
      focusHarnessId: null,
      focusTab: null,
    });
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "traycer",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "openrouter",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
      ],
    };
    providerMocks.setSelectionMutate.mockClear();
    providerMocks.setEnabledMutate.mockClear();
    providerMocks.setEnvOverrideMutate.mockClear();
    providerMocks.deleteEnvOverrideMutate.mockClear();
  });

  afterEach(() => {
    cleanup();
    useProvidersFocusStore.setState({
      focusHarnessId: null,
      focusTab: null,
    });
  });

  it("lists OpenCode CLI candidates for Traycer and mutates Traycer selection", () => {
    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Traycer/i }));

    expect(screen.getByText("/usr/local/bin/opencode")).toBeDefined();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Select /usr/local/bin/opencode",
      }),
    );

    expect(providerMocks.setSelectionMutate).toHaveBeenCalledWith({
      providerId: "traycer",
      selection: { kind: "path" },
    });
  });

  it("hides the CLI-candidates picker for Amp - a selected path is never consulted", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "amp",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Add custom path" }),
    ).toBeNull();
  });

  it("orders the provider rail by the default provider order", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "openrouter",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "qwen",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "codex",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "cursor",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "droid",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "kilocode",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "claude-code",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
        providerState({
          providerId: "copilot",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    const nav = screen.getByRole("navigation", { name: "Providers" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Codex",
      "Claude Code",
      "OpenRouter",
      "Droid",
      "Cursor",
      "Copilot",
      "Kilo Code",
      "Qwen Code",
    ]);
  });

  it("renders configured, unavailable, and pending auth statuses", () => {
    providerMocks.listResult.data = {
      providers: [
        providerStateWithAuth(
          {
            providerId: "codex",
            selected: { kind: "bundled" },
            candidates: [],
            envOverrides: [],
          },
          {
            status: "configured",
            badgeText: "Codex API Key",
            label: null,
            detail: null,
          },
          false,
        ),
        providerStateWithAuth(
          {
            providerId: "cursor",
            selected: { kind: "bundled" },
            candidates: [],
            envOverrides: [],
          },
          {
            status: "unavailable",
            badgeText: null,
            label: null,
            detail: "network failed",
          },
          false,
        ),
        providerStateWithAuth(
          {
            providerId: "qwen",
            selected: { kind: "bundled" },
            candidates: [],
            envOverrides: [],
          },
          {
            status: "authenticated",
            badgeText: null,
            label: "Authenticated as qwen@example.test",
            detail: null,
          },
          true,
        ),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.getByText("Configured, not verified")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(screen.getByText("Could not check account status")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Qwen Code" }));
    expect(screen.getByText("Checking account")).toBeDefined();
  });

  it("does not render disabled attribution for providers", () => {
    providerMocks.listResult.data = {
      providers: [
        {
          ...providerState({
            providerId: "codex",
            selected: { kind: "bundled" },
            candidates: [],
            envOverrides: [],
          }),
          enabled: false,
          disabledBy: {
            userId: "a7f4dd6c-7f20-44c2-b83b-fdc71c258b80",
            handle: "teammate",
            at: 1,
          },
        },
        {
          ...providerState({
            providerId: "traycer",
            selected: { kind: "bundled" },
            candidates: [],
            envOverrides: [],
          }),
          enabled: false,
          disabledBy: {
            userId: "0c8cedd2-b928-4980-bf87-fb9f948c23e5",
            handle: null,
            at: 1,
          },
        },
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.queryByText(/Disabled by/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Traycer/i }));

    expect(screen.queryByText(/Disabled by/)).toBeNull();
  });

  it("lists OpenCode CLI candidates for OpenRouter and mutates OpenRouter selection", () => {
    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/i }));

    expect(screen.getByText("/usr/local/bin/opencode")).toBeDefined();

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Select /usr/local/bin/opencode",
      }),
    );

    expect(providerMocks.setSelectionMutate).toHaveBeenCalledWith({
      providerId: "openrouter",
      selection: { kind: "path" },
    });
  });

  it("shows provider-scoped environment controls from provider state", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [{ key: "OPENAI_API_KEY", value: null }],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "traycer",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    selectTab("Env");

    expect(screen.getByText("Environment variables")).toBeDefined();
    expect(screen.getByDisplayValue("OPENAI_API_KEY")).toBeDefined();
    expect(
      screen.getByText(/Applied when Traycer spawns the OpenCode/),
    ).toBeDefined();
  });

  it("renders the host picker in the header (like Worktrees)", () => {
    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.getByRole("combobox", { name: "Host" })).toBeDefined();
  });

  it("blocks disabling the last enabled provider", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "traycer",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    const switchElement = screen.getByRole("switch");
    if (!(switchElement instanceof HTMLButtonElement)) {
      throw new Error("Expected provider switch to render as a button.");
    }

    expect(switchElement.disabled).toBe(true);
    fireEvent.click(switchElement);

    expect(providerMocks.setEnabledMutate).not.toHaveBeenCalled();
  });

  it("renders capability-driven tabs and hides unsupported ones", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "cursor",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: CURSOR_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.getByRole("tab", { name: "General" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Env" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Usage limits" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "MCP" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Plugins" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Skills" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));

    expect(screen.queryByRole("tab", { name: "General" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Usage limits" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Env" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "MCP" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Plugins" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Skills" })).toBeDefined();
  });

  it("keeps the current tab across providers when both support it", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [{ key: "A", value: "1" }],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "cursor",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [{ key: "B", value: "2" }],
          nativeCapabilities: CURSOR_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    selectTab("Env");
    expect(screen.getByDisplayValue("A")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(screen.getByDisplayValue("B")).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "Env" }).getAttribute("data-state"),
    ).toBe("active");
  });

  it("falls back to the first supported tab when the current tab is missing", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "amp",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: ENV_ONLY_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    selectTab("MCP");
    expect(screen.getByTestId("provider-mcp-tab")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Amp" }));
    expect(screen.queryByRole("tab", { name: "MCP" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Env" })).toBeDefined();
    expect(screen.getByText("Environment variables")).toBeDefined();
  });

  it("deep-links focusTab once-and-clear alongside focusHarnessId", () => {
    useProvidersFocusStore.getState().setFocusHarnessId("cursor");
    useProvidersFocusStore.getState().setFocusTab("mcp");

    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "opencode",
          selected: { kind: "bundled" },
          candidates: OPENCODE_CANDIDATES,
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
        providerState({
          providerId: "cursor",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: CURSOR_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("provider-mcp-tab")).toBeDefined();
    expect(
      screen.getByRole("tab", { name: "MCP" }).getAttribute("data-state"),
    ).toBe("active");
    expect(useProvidersFocusStore.getState().focusHarnessId).toBeNull();
    expect(useProvidersFocusStore.getState().focusTab).toBeNull();
  });

  it("ignores focusTab when the target provider does not support it", () => {
    useProvidersFocusStore.getState().setFocusHarnessId("cursor");
    useProvidersFocusStore.getState().setFocusTab("general");

    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "cursor",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: CURSOR_TABS,
        }),
      ],
    };

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    expect(screen.queryByRole("tab", { name: "General" })).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Env" }).getAttribute("data-state"),
    ).toBe("active");
  });

  it("shows Plugins tab body and Skills tab body", () => {
    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    selectTab("Plugins");
    expect(screen.getByText("Installed plugins")).toBeDefined();

    selectTab("Skills");
    expect(
      screen.getByText(/Invoked by the agent when relevant/),
    ).toBeDefined();
  });

  it("does not flush terminal-agent args on keystroke alone", () => {
    providerMocks.listResult.data = {
      providers: [
        providerState({
          providerId: "claude-code",
          selected: { kind: "bundled" },
          candidates: [],
          envOverrides: [],
          nativeCapabilities: FULL_TABS,
        }),
      ],
    };
    providerMocks.setTerminalAgentArgsMutate.mockClear();

    render(
      <TooltipProvider>
        <ProvidersSettingsPanel />
      </TooltipProvider>,
    );

    selectTab("General");
    const input = screen.getByPlaceholderText("--dangerously-skip-permissions");
    fireEvent.change(input, { target: { value: "--foo" } });

    expect(providerMocks.setTerminalAgentArgsMutate).not.toHaveBeenCalled();
  });
});
