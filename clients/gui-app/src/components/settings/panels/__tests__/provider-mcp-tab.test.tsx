import "../../../../../__tests__/test-browser-apis";
import type {
  ProviderMcpCapabilities,
  ProviderMcpServer,
} from "@traycer/protocol/host/provider-native-schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderMcpTab } from "@/components/settings/panels/provider-mcp-tab";
import { useWorkspaceFoldersStore } from "@/stores/workspace/workspace-folders-store";

const mcpMocks = vi.hoisted(() => ({
  listResult: {
    data: { servers: [] as ProviderMcpServer[] },
    isPending: false,
    isError: false,
    error: null as { message: string } | null,
    isFetching: false,
  },
  projectListResult: {
    data: { servers: [] as ProviderMcpServer[] },
    isPending: false,
    isError: false,
    error: null as { message: string } | null,
    isFetching: false,
  },
  mutate: vi.fn(),
  mutateIsPending: false,
  discoverMutate: vi.fn(),
  authMutate: vi.fn(),
  openExternalLink: vi.fn(),
  listCalls: [] as Array<{
    providerId: string;
    scope: string;
    workspaceRoot: string | null;
    enabled: boolean;
    pollWhilePending: boolean;
  }>,
}));

vi.mock("@/hooks/providers/use-providers-mcp-list-query", () => ({
  useProvidersMcpList: (args: {
    providerId: string;
    scope: string;
    workspaceRoot: string | null;
    enabled: boolean;
    pollWhilePending: boolean;
  }) => {
    mcpMocks.listCalls.push(args);
    // Shadow read: project scope while Global is the active primary list.
    const hasActiveGlobal = mcpMocks.listCalls.some(
      (c) => c.scope === "global" && c.enabled,
    );
    if (
      args.scope === "project" &&
      args.enabled &&
      !args.pollWhilePending &&
      hasActiveGlobal
    ) {
      return mcpMocks.projectListResult;
    }
    if (!args.enabled) {
      return {
        data: undefined,
        isPending: false,
        isError: false,
        error: null,
        isFetching: false,
      };
    }
    return mcpMocks.listResult;
  },
}));

vi.mock("@/hooks/providers/use-providers-mcp-mutate-mutation", () => ({
  useProvidersMcpMutate: () => ({
    mutate: mcpMocks.mutate,
    isPending: mcpMocks.mutateIsPending,
  }),
}));

vi.mock("@/hooks/providers/use-providers-mcp-discover-mutation", () => ({
  useProvidersMcpDiscover: () => ({
    mutate: mcpMocks.discoverMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/providers/use-providers-mcp-auth-mutation", () => ({
  useProvidersMcpAuth: () => ({
    mutate: mcpMocks.authMutate,
    isPending: false,
  }),
}));

vi.mock("@/providers/use-runner-host", () => ({
  useRunnerHost: () => ({
    openExternalLink: mcpMocks.openExternalLink,
  }),
}));

const FULL_CAPS: ProviderMcpCapabilities = {
  transports: ["stdio", "http"],
  scopes: ["global", "project"],
  authTypes: ["none", "headers", "oauth"],
  authActions: ["login", "logout"],
  mutationActions: ["add", "update", "remove", "toggleServer", "toggleTool"],
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

const CURSOR_CAPS: ProviderMcpCapabilities = {
  ...FULL_CAPS,
  perToolBacking: "degraded-server-level",
  mutationActions: ["add", "update", "remove", "toggleServer"],
  authActions: ["login"],
  instructionsSource: "none",
};

const KIMI_CAPS: ProviderMcpCapabilities = {
  ...FULL_CAPS,
  scopes: ["global"],
};

function connectedServer(
  overrides: Partial<ProviderMcpServer>,
): ProviderMcpServer {
  return {
    name: "context7",
    enabled: true,
    transport: {
      type: "http",
      url: "https://mcp.context7.com",
      headers: null,
    },
    status: "connected",
    statusSource: "probe",
    statusDetail: null,
    tools: [
      {
        name: "search_docs",
        description: "Search documentation",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
        enabled: true,
        readOnly: false,
      },
      {
        name: "list_projects",
        description: null,
        inputSchema: null,
        enabled: false,
        readOnly: false,
      },
    ],
    discoveryPending: false,
    instructions: "Use these tools carefully.",
    configOnly: false,
    stdioDegraded: false,
    ...overrides,
  };
}

function renderTab(
  caps: ProviderMcpCapabilities,
  providerId: "codex" | "cursor" | "kimi",
) {
  return render(
    <ProviderMcpTab
      providerId={providerId}
      capabilities={caps}
      providerLabel={providerId}
    />,
  );
}

describe("<ProviderMcpTab />", () => {
  beforeEach(() => {
    mcpMocks.listResult = {
      data: { servers: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    };
    mcpMocks.projectListResult = {
      data: { servers: [] },
      isPending: false,
      isError: false,
      error: null,
      isFetching: false,
    };
    mcpMocks.mutate.mockReset();
    mcpMocks.discoverMutate.mockReset();
    mcpMocks.authMutate.mockReset();
    mcpMocks.openExternalLink.mockReset();
    mcpMocks.mutateIsPending = false;
    mcpMocks.listCalls = [];
    useWorkspaceFoldersStore.setState({
      folders: ["/Users/dev/app"],
      folderInfoByPath: {
        "/Users/dev/app": {
          path: "/Users/dev/app",
          name: "app",
          repoIdentifier: null,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lists servers with probe connectivity label and tool count", () => {
    mcpMocks.listResult.data = { servers: [connectedServer({})] };
    renderTab(FULL_CAPS, "codex");

    expect(screen.getByText("context7")).toBeDefined();
    expect(screen.getByText("connectivity check")).toBeDefined();
    expect(screen.getByText("2 tools")).toBeDefined();
    expect(screen.getByText("Reachable")).toBeDefined();
  });

  it("switches Global | Project scope and stamps workspaceRoot", () => {
    renderTab(FULL_CAPS, "codex");

    const globalCall = mcpMocks.listCalls.find(
      (c) => c.scope === "global" && c.enabled,
    );
    expect(globalCall?.workspaceRoot).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    const projectCall = mcpMocks.listCalls.find(
      (c) =>
        c.scope === "project" &&
        c.enabled &&
        c.workspaceRoot === "/Users/dev/app",
    );
    expect(projectCall).toBeDefined();
    expect(screen.getByText("app")).toBeDefined();
  });

  it("shows empty state for Project with no workspace", () => {
    useWorkspaceFoldersStore.setState({
      folders: [],
      folderInfoByPath: {},
    });
    renderTab(FULL_CAPS, "codex");

    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    expect(
      screen.getByText(/Open a workspace to manage project-scoped MCP servers/),
    ).toBeDefined();
  });

  it("locks kimi to Global (no scope switch)", () => {
    renderTab(KIMI_CAPS, "kimi");
    expect(screen.queryByRole("button", { name: "Project" })).toBeNull();
    expect(screen.getByText("Global scope only")).toBeDefined();
  });

  it("shows shadowed by project badge on global rows", () => {
    mcpMocks.listResult.data = { servers: [connectedServer({})] };
    mcpMocks.projectListResult.data = {
      servers: [connectedServer({ name: "context7", statusSource: "native" })],
    };
    renderTab(FULL_CAPS, "codex");

    expect(screen.getByText("shadowed by project")).toBeDefined();
  });

  it("expands tools grid and toggles a tool optimistically", () => {
    mcpMocks.listResult.data = { servers: [connectedServer({})] };
    renderTab(FULL_CAPS, "codex");

    fireEvent.click(screen.getByRole("button", { name: /Expand context7/ }));
    expect(screen.getByText("Tools (2)")).toBeDefined();
    expect(screen.getByText("search_docs")).toBeDefined();
    expect(screen.getByText("list_projects")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Disable tool search_docs" }),
    );
    expect(mcpMocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: {
          action: "toggleTool",
          serverName: "context7",
          toolName: "search_docs",
          enabled: false,
        },
      }),
    );
  });

  it("renders read-only tools grid for degraded-server-level backing", () => {
    mcpMocks.listResult.data = {
      servers: [
        connectedServer({
          tools: [
            {
              name: "search_docs",
              description: "Search",
              inputSchema: null,
              enabled: true,
              readOnly: true,
            },
          ],
        }),
      ],
    };
    renderTab(CURSOR_CAPS, "cursor");

    fireEvent.click(screen.getByRole("button", { name: /Expand context7/ }));
    expect(screen.queryByText("Enable all")).toBeNull();
    const chip = screen.getByRole("button", { name: "search_docs" });
    fireEvent.click(chip);
    expect(mcpMocks.mutate).not.toHaveBeenCalled();
  });

  it("rejects duplicate names in the add modal", () => {
    mcpMocks.listResult.data = { servers: [connectedServer({})] };
    renderTab(FULL_CAPS, "codex");

    fireEvent.click(screen.getByRole("button", { name: /Add MCP server/ }));
    const dialog = screen.getByTestId("provider-mcp-add-dialog");
    const nameInput = within(dialog).getByPlaceholderText("context7");
    fireEvent.change(nameInput, { target: { value: "context7" } });
    const urlInput = within(dialog).getByPlaceholderText(
      "https://mcp.example.com",
    );
    fireEvent.change(urlInput, {
      target: { value: "https://example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(
      screen.getByText(/A server named “context7” already exists/),
    ).toBeDefined();
    expect(mcpMocks.mutate).not.toHaveBeenCalled();
  });

  it("validates remote URL on add", () => {
    renderTab(FULL_CAPS, "codex");
    fireEvent.click(screen.getByRole("button", { name: /Add MCP server/ }));
    const dialog = screen.getByTestId("provider-mcp-add-dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("context7"), {
      target: { value: "new-server" },
    });
    fireEvent.change(
      within(dialog).getByPlaceholderText("https://mcp.example.com"),
      { target: { value: "not-a-url" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(screen.getByText(/valid http\(s\) URL/)).toBeDefined();
    expect(mcpMocks.mutate).not.toHaveBeenCalled();
  });

  it("starts auth login and opens authorizationUrl", () => {
    mcpMocks.listResult.data = {
      servers: [
        connectedServer({
          status: "needs_auth",
          tools: [],
        }),
      ],
    };
    mcpMocks.authMutate.mockImplementation(
      (
        _vars: unknown,
        opts: {
          onSuccess: (data: {
            result: { kind: "authorizationUrl"; authorizationUrl: string };
          }) => void;
          onSettled: () => void;
        },
      ) => {
        opts.onSuccess({
          result: {
            kind: "authorizationUrl",
            authorizationUrl: "https://auth.example.com/oauth",
          },
        });
        opts.onSettled();
      },
    );
    renderTab(FULL_CAPS, "codex");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mcpMocks.authMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { action: "login", serverName: "context7" },
      }),
      expect.anything(),
    );
    expect(mcpMocks.openExternalLink).toHaveBeenCalledWith(
      "https://auth.example.com/oauth",
    );
  });

  it("redacts secrets in pendingInstruction auth text", () => {
    mcpMocks.listResult.data = {
      servers: [
        connectedServer({
          status: "needs_auth",
          tools: [],
        }),
      ],
    };
    mcpMocks.authMutate.mockImplementation(
      (
        _vars: unknown,
        opts: {
          onSuccess: (data: {
            result: { kind: "pendingInstruction"; instruction: string };
          }) => void;
          onSettled: () => void;
        },
      ) => {
        opts.onSuccess({
          result: {
            kind: "pendingInstruction",
            instruction:
              "Visit https://tok@example.com/oauth with OPENAI_API_KEY=sk-secret",
          },
        });
        opts.onSettled();
      },
    );
    renderTab(FULL_CAPS, "codex");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.queryByText(/sk-secret/)).toBeNull();
    expect(screen.queryByText(/tok@/)).toBeNull();
    expect(screen.getByText(/<redacted>/)).toBeDefined();
  });

  it("shows Traycer sessions only note when descriptor flag is set", () => {
    mcpMocks.listResult.data = { servers: [] };
    renderTab(
      {
        ...FULL_CAPS,
        traycerSessionsOnlyEnforcement: true,
      },
      "codex",
    );
    expect(screen.getByText(/Traycer sessions only/)).toBeDefined();
  });
});
