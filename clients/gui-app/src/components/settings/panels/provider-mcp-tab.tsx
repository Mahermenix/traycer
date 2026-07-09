import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ProviderId } from "@traycer/protocol/host/provider-schemas";
import type {
  ProviderMcpCapabilities,
  ProviderMcpServer,
  ProviderMcpServerStatus,
  ProviderMcpTool,
  ProviderNativeScope,
} from "@traycer/protocol/host/provider-native-schemas";
import { MutedAgentSpinner } from "@/components/ui/agent-spinning-dots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { redactLogText } from "@/lib/logger";
import { useProvidersMcpList } from "@/hooks/providers/use-providers-mcp-list-query";
import { useProvidersMcpMutate } from "@/hooks/providers/use-providers-mcp-mutate-mutation";
import { useProvidersMcpDiscover } from "@/hooks/providers/use-providers-mcp-discover-mutation";
import { useProvidersMcpAuth } from "@/hooks/providers/use-providers-mcp-auth-mutation";
import { useWorkspaceFoldersStore } from "@/stores/workspace/workspace-folders-store";
import { useRunnerHost } from "@/providers/use-runner-host";
import { cn } from "@/lib/utils";
import { ProviderMcpAddDialog } from "./provider-mcp-add-dialog";

const EMPTY_MCP_SERVERS: readonly ProviderMcpServer[] = [];

function resolveLockedScope(
  supportsProject: boolean,
  supportsGlobal: boolean,
): ProviderNativeScope {
  if (supportsProject && !supportsGlobal) return "project";
  return "global";
}

function workspaceDisplayName(
  root: string,
  infoByPath: Readonly<Record<string, { readonly name: string }>>,
): string {
  if (Object.hasOwn(infoByPath, root)) {
    return infoByPath[root].name;
  }
  return root;
}

/**
 * Drop names that have settled (gone / not connecting|needs_auth).
 * Returns the same `awaiting` reference when nothing changed so render-time
 * state adjustment can compare by identity.
 */
function pruneAuthAwaiting(
  awaiting: ReadonlySet<string>,
  servers: readonly ProviderMcpServer[],
): ReadonlySet<string> {
  if (awaiting.size === 0) return awaiting;
  const byName = new Map(servers.map((s) => [s.name, s]));
  const next = new Set<string>();
  for (const name of awaiting) {
    const server = byName.get(name);
    if (server === undefined) continue;
    if (server.status === "connecting" || server.status === "needs_auth") {
      next.add(name);
    }
  }
  if (next.size === awaiting.size) {
    let same = true;
    for (const name of next) {
      if (!awaiting.has(name)) {
        same = false;
        break;
      }
    }
    if (same) return awaiting;
  }
  return next;
}

function mcpMutationFlags(capabilities: ProviderMcpCapabilities) {
  const canAdd = capabilities.mutationActions.includes("add");
  const canRemove = capabilities.mutationActions.includes("remove");
  const canToggleServer = capabilities.mutationActions.includes("toggleServer");
  const canToggleTool = capabilities.mutationActions.includes("toggleTool");
  const toolsReadOnly =
    capabilities.perToolBacking === "degraded-server-level" ||
    capabilities.perToolBacking === "none" ||
    !canToggleTool;
  return { canAdd, canRemove, canToggleServer, toolsReadOnly };
}

function useMcpScope(capabilities: ProviderMcpCapabilities) {
  const folders = useWorkspaceFoldersStore((s) => s.folders);
  const folderInfoByPath = useWorkspaceFoldersStore((s) => s.folderInfoByPath);
  const workspaceRoot = folders.length > 0 ? folders[0] : null;
  const workspaceName =
    workspaceRoot === null
      ? null
      : workspaceDisplayName(workspaceRoot, folderInfoByPath);

  const supportsGlobal = capabilities.scopes.includes("global");
  const supportsProject = capabilities.scopes.includes("project");
  const multiScope = supportsGlobal && supportsProject;
  const lockedScope = resolveLockedScope(supportsProject, supportsGlobal);

  const [scope, setScope] = useState<ProviderNativeScope>(lockedScope);
  const effectiveScope: ProviderNativeScope = multiScope ? scope : lockedScope;

  const projectNeedsWorkspace =
    effectiveScope === "project" && workspaceRoot === null;
  const listWorkspaceRoot = effectiveScope === "global" ? null : workspaceRoot;

  return {
    workspaceRoot,
    workspaceName,
    multiScope,
    effectiveScope,
    setScope,
    projectNeedsWorkspace,
    listWorkspaceRoot,
    listEnabled: !projectNeedsWorkspace,
  };
}

export function ProviderMcpTab(props: {
  readonly providerId: ProviderId;
  readonly capabilities: ProviderMcpCapabilities;
  readonly providerLabel: string;
}): ReactNode {
  const { providerId, capabilities, providerLabel } = props;
  const scopeState = useMcpScope(capabilities);
  const {
    workspaceRoot,
    workspaceName,
    multiScope,
    effectiveScope,
    setScope,
    projectNeedsWorkspace,
    listWorkspaceRoot,
    listEnabled,
  } = scopeState;

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingServerNames, setPendingServerNames] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // After opening an authorizationUrl, poll mcpList until the row settles.
  // Settled names are pruned during render (no sync effect).
  const [authAwaitingNames, setAuthAwaitingNames] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [authInstruction, setAuthInstruction] = useState<string | null>(null);

  // Shadow badges: when viewing Global with a workspace, also read project
  // names so host-side project-overrides-global can be labeled.
  const projectListForShadow = useProvidersMcpList({
    providerId,
    scope: "project",
    workspaceRoot,
    enabled:
      multiScope && effectiveScope === "global" && workspaceRoot !== null,
    pollWhilePending: false,
  });

  // Primary list: poll while any auth-awaiting name is still unsettled.
  // Settled names are pruned during render below so the next pass stops polling.
  const listQuery = useProvidersMcpList({
    providerId,
    scope: effectiveScope,
    workspaceRoot: listWorkspaceRoot,
    enabled: listEnabled,
    pollWhilePending: authAwaitingNames.size > 0,
  });

  const servers = listQuery.data?.servers ?? EMPTY_MCP_SERVERS;

  // Adjust auth-awaiting set from latest list data during render (React
  // "storing information from previous renders" pattern) — avoids setState
  // inside an effect.
  const prunedAuthAwaiting = pruneAuthAwaiting(authAwaitingNames, servers);
  if (prunedAuthAwaiting !== authAwaitingNames) {
    setAuthAwaitingNames(prunedAuthAwaiting);
  }

  const shadowedNames = useMemo(() => {
    if (effectiveScope !== "global") return new Set<string>();
    const projectServers = projectListForShadow.data?.servers;
    if (projectServers === undefined) return new Set<string>();
    return new Set(projectServers.map((s) => s.name));
  }, [effectiveScope, projectListForShadow.data?.servers]);

  const mutate = useProvidersMcpMutate();
  const discover = useProvidersMcpDiscover();
  const auth = useProvidersMcpAuth();
  const runnerHost = useRunnerHost();

  const existingNames = useMemo(() => servers.map((s) => s.name), [servers]);

  // Hoisted out of JSX: `eslint --fix` (react/jsx-no-leaked-render) rewrites a
  // logical `&&` inside a JSX attribute into `cond ? value : null`, which makes
  // this `boolean | null` and fails the dialog's `isPending: boolean` prop.
  const deleteDialogPending = mutate.isPending && deleteTarget !== null;

  const { canAdd, canRemove, canToggleServer, toolsReadOnly } =
    mcpMutationFlags(capabilities);

  const markPending = useCallback((name: string, pending: boolean) => {
    setPendingServerNames((prev) => {
      const next = new Set(prev);
      if (pending) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const scopeTuple = useMemo(
    () => ({
      providerId,
      scope: effectiveScope,
      workspaceRoot: listWorkspaceRoot,
    }),
    [providerId, effectiveScope, listWorkspaceRoot],
  );

  const handleRefresh = useCallback(
    (serverName: string) => {
      markPending(serverName, true);
      discover.mutate(
        { ...scopeTuple, serverName, forceRefresh: true },
        {
          onSettled: () => {
            markPending(serverName, false);
          },
        },
      );
    },
    [discover, markPending, scopeTuple],
  );

  const handleToggleServer = useCallback(
    (server: ProviderMcpServer, enabled: boolean) => {
      mutate.mutate({
        ...scopeTuple,
        mutation: { action: "toggleServer", name: server.name, enabled },
      });
    },
    [mutate, scopeTuple],
  );

  const handleToggleTool = useCallback(
    (serverName: string, toolName: string, enabled: boolean) => {
      mutate.mutate({
        ...scopeTuple,
        mutation: {
          action: "toggleTool",
          serverName,
          toolName,
          enabled,
        },
      });
    },
    [mutate, scopeTuple],
  );

  const handleToggleAllTools = useCallback(
    (server: ProviderMcpServer, enabled: boolean) => {
      for (const tool of server.tools) {
        if (tool.readOnly || tool.enabled === enabled) continue;
        mutate.mutate({
          ...scopeTuple,
          mutation: {
            action: "toggleTool",
            serverName: server.name,
            toolName: tool.name,
            enabled,
          },
        });
      }
    },
    [mutate, scopeTuple],
  );

  const handleAuth = useCallback(
    (serverName: string, action: "login" | "logout" | "forceReauth") => {
      markPending(serverName, true);
      setAuthInstruction(null);
      auth.mutate(
        {
          ...scopeTuple,
          auth: { action, serverName },
        },
        {
          onSuccess: (data) => {
            const result = data.result;
            if (result.kind === "authorizationUrl") {
              setAuthAwaitingNames((prev) => new Set(prev).add(serverName));
              void runnerHost.openExternalLink(result.authorizationUrl);
            } else if (result.kind === "pendingInstruction") {
              setAuthAwaitingNames((prev) => new Set(prev).add(serverName));
              setAuthInstruction(redactLogText(result.instruction));
            } else if (result.kind === "unsupported") {
              setAuthInstruction(
                redactLogText(
                  result.reason ??
                    "This provider does not support this auth action.",
                ),
              );
            }
          },
          onSettled: () => {
            markPending(serverName, false);
          },
        },
      );
    },
    [auth, markPending, runnerHost, scopeTuple],
  );

  const handleDelete = useCallback(() => {
    if (deleteTarget === null) return;
    const name = deleteTarget;
    markPending(name, true);
    mutate.mutate(
      {
        ...scopeTuple,
        mutation: { action: "remove", name },
      },
      {
        onSettled: () => {
          markPending(name, false);
          setDeleteTarget(null);
        },
      },
    );
  }, [deleteTarget, markPending, mutate, scopeTuple]);

  return (
    <div className="flex flex-col gap-3" data-testid="provider-mcp-tab">
      <McpScopeHeader
        multiScope={multiScope}
        effectiveScope={effectiveScope}
        canAdd={canAdd}
        projectNeedsWorkspace={projectNeedsWorkspace}
        onScopeChange={setScope}
        onAdd={() => {
          setAddOpen(true);
        }}
      />

      {effectiveScope === "project" && workspaceRoot !== null ? (
        <p className="text-ui-xs text-muted-foreground">
          Project:{" "}
          <span className="font-medium text-foreground">{workspaceName}</span>
        </p>
      ) : null}

      <McpCapabilityNotices
        capabilities={capabilities}
        authInstruction={authInstruction}
      />

      <McpServerList
        projectNeedsWorkspace={projectNeedsWorkspace}
        listPending={listQuery.isPending}
        listError={listQuery.isError}
        errorMessage={listQuery.isError ? listQuery.error.message : null}
        servers={servers}
        providerLabel={providerLabel}
        capabilities={capabilities}
        shadowedNames={shadowedNames}
        pendingServerNames={pendingServerNames}
        canRemove={canRemove}
        canToggleServer={canToggleServer}
        toolsReadOnly={toolsReadOnly}
        onRefresh={handleRefresh}
        onToggleServer={handleToggleServer}
        onToggleTool={handleToggleTool}
        onToggleAllTools={handleToggleAllTools}
        onAuth={handleAuth}
        onDelete={setDeleteTarget}
      />

      <ProviderMcpAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        providerLabel={providerLabel}
        capabilities={capabilities}
        existingNames={existingNames}
        scopeTuple={scopeTuple}
      />

      <ConfirmDestructiveDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Remove MCP server"
        description={
          deleteTarget === null
            ? ""
            : `Remove “${deleteTarget}” from this provider's ${effectiveScope} config?`
        }
        cascadeSummary={null}
        actionLabel="Remove"
        isPending={deleteDialogPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function McpScopeHeader(props: {
  readonly multiScope: boolean;
  readonly effectiveScope: ProviderNativeScope;
  readonly canAdd: boolean;
  readonly projectNeedsWorkspace: boolean;
  readonly onScopeChange: (scope: ProviderNativeScope) => void;
  readonly onAdd: () => void;
}): ReactNode {
  const scopeOnlyLabel =
    props.effectiveScope === "global"
      ? "Global scope only"
      : "Project scope only";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {props.multiScope ? (
        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          <ScopeChip
            label="Global"
            active={props.effectiveScope === "global"}
            onClick={() => {
              props.onScopeChange("global");
            }}
          />
          <ScopeChip
            label="Project"
            active={props.effectiveScope === "project"}
            onClick={() => {
              props.onScopeChange("project");
            }}
          />
        </div>
      ) : (
        <p className="text-ui-xs text-muted-foreground">{scopeOnlyLabel}</p>
      )}
      {props.canAdd && !props.projectNeedsWorkspace ? (
        <Button type="button" size="sm" variant="outline" onClick={props.onAdd}>
          <Plus className="size-3.5" />
          Add MCP server
        </Button>
      ) : null}
    </div>
  );
}

function McpCapabilityNotices(props: {
  readonly capabilities: ProviderMcpCapabilities;
  readonly authInstruction: string | null;
}): ReactNode {
  return (
    <>
      {props.capabilities.traycerSessionsOnlyEnforcement ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-ui-xs text-muted-foreground">
          Tool enable/disable applies to Traycer sessions only for this
          provider.
        </p>
      ) : null}
      {props.capabilities.stdioDegradeNotice ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-ui-xs text-muted-foreground">
          Stdio servers are config-only under this provider — live connect is
          unavailable in-session.
        </p>
      ) : null}
      {props.authInstruction !== null ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-ui-xs text-muted-foreground">
          {props.authInstruction}
        </p>
      ) : null}
    </>
  );
}

function McpServerList(props: {
  readonly projectNeedsWorkspace: boolean;
  readonly listPending: boolean;
  readonly listError: boolean;
  readonly errorMessage: string | null;
  readonly servers: readonly ProviderMcpServer[];
  readonly providerLabel: string;
  readonly capabilities: ProviderMcpCapabilities;
  readonly shadowedNames: ReadonlySet<string>;
  readonly pendingServerNames: ReadonlySet<string>;
  readonly canRemove: boolean;
  readonly canToggleServer: boolean;
  readonly toolsReadOnly: boolean;
  readonly onRefresh: (serverName: string) => void;
  readonly onToggleServer: (
    server: ProviderMcpServer,
    enabled: boolean,
  ) => void;
  readonly onToggleTool: (
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => void;
  readonly onToggleAllTools: (
    server: ProviderMcpServer,
    enabled: boolean,
  ) => void;
  readonly onAuth: (
    serverName: string,
    action: "login" | "logout" | "forceReauth",
  ) => void;
  readonly onDelete: (serverName: string) => void;
}): ReactNode {
  if (props.projectNeedsWorkspace) {
    return (
      <EmptyState
        title="Open a workspace"
        description="Open a workspace to manage project-scoped MCP servers."
      />
    );
  }
  if (props.listPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-ui-sm text-muted-foreground">
        <MutedAgentSpinner />
        Loading MCP servers
      </div>
    );
  }
  if (props.listError) {
    return (
      <EmptyState
        title="Couldn't load MCP servers"
        description={props.errorMessage ?? "Try refreshing or check the host."}
      />
    );
  }
  if (props.servers.length === 0) {
    return (
      <EmptyState
        title="No MCP servers"
        description={`Add an MCP server so ${props.providerLabel} can use external tools and context.`}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {props.servers.map((server) => (
        <McpServerRow
          key={server.name}
          server={server}
          capabilities={props.capabilities}
          shadowed={props.shadowedNames.has(server.name)}
          pending={
            props.pendingServerNames.has(server.name) ||
            server.discoveryPending ||
            server.status === "connecting"
          }
          canRemove={props.canRemove}
          canToggleServer={props.canToggleServer}
          toolsReadOnly={props.toolsReadOnly}
          onRefresh={() => {
            props.onRefresh(server.name);
          }}
          onToggleServer={(enabled) => {
            props.onToggleServer(server, enabled);
          }}
          onToggleTool={(toolName, enabled) => {
            props.onToggleTool(server.name, toolName, enabled);
          }}
          onToggleAllTools={(enabled) => {
            props.onToggleAllTools(server, enabled);
          }}
          onLogin={() => {
            props.onAuth(server.name, "login");
          }}
          onLogout={() => {
            props.onAuth(server.name, "logout");
          }}
          onForceReauth={() => {
            props.onAuth(server.name, "forceReauth");
          }}
          onDelete={() => {
            props.onDelete(server.name);
          }}
        />
      ))}
    </ul>
  );
}

function ScopeChip(props: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "inline-flex items-center rounded-sm px-3 py-1 text-ui-sm transition-colors",
        props.active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {props.label}
    </button>
  );
}

function EmptyState(props: {
  readonly title: string;
  readonly description: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 p-4">
      <div className="text-ui-sm font-medium text-foreground">
        {props.title}
      </div>
      <p className="text-ui-xs text-muted-foreground">{props.description}</p>
    </div>
  );
}

function serverRowFlags(
  server: ProviderMcpServer,
  capabilities: ProviderMcpCapabilities,
) {
  const showLogin =
    capabilities.authActions.includes("login") &&
    (server.status === "needs_auth" || server.status === "error");
  const showLogout =
    capabilities.authActions.includes("logout") &&
    server.status === "connected";
  const showForceReauth =
    capabilities.authActions.includes("forceReauth") &&
    (server.status === "needs_auth" || server.status === "error");
  const toolsListable =
    server.status === "connected" &&
    !server.configOnly &&
    !server.stdioDegraded;
  return { showLogin, showLogout, showForceReauth, toolsListable };
}

function McpServerRow(props: {
  readonly server: ProviderMcpServer;
  readonly capabilities: ProviderMcpCapabilities;
  readonly shadowed: boolean;
  readonly pending: boolean;
  readonly canRemove: boolean;
  readonly canToggleServer: boolean;
  readonly toolsReadOnly: boolean;
  readonly onRefresh: () => void;
  readonly onToggleServer: (enabled: boolean) => void;
  readonly onToggleTool: (toolName: string, enabled: boolean) => void;
  readonly onToggleAllTools: (enabled: boolean) => void;
  readonly onLogin: () => void;
  readonly onLogout: () => void;
  readonly onForceReauth: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const {
    server,
    capabilities,
    shadowed,
    pending,
    canRemove,
    canToggleServer,
    toolsReadOnly,
    onRefresh,
    onToggleServer,
    onToggleTool,
    onToggleAllTools,
    onLogin,
    onLogout,
    onForceReauth,
    onDelete,
  } = props;
  const [open, setOpen] = useState(false);
  const [subTab, setSubTab] = useState<"tools" | "instructions">("tools");

  const statusLabel = statusLabelFor(server);
  const { showLogin, showLogout, showForceReauth, toolsListable } =
    serverRowFlags(server, capabilities);

  return (
    <li className="rounded-lg border border-border/60">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-label={
                open ? `Collapse ${server.name}` : `Expand ${server.name}`
              }
            >
              {open ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-ui-sm font-medium text-foreground">
                {server.name}
              </span>
              <StatusDot status={server.status} pending={pending} />
              <span className="truncate text-ui-xs text-muted-foreground">
                {statusLabel}
              </span>
              {server.tools.length > 0 ? (
                <span className="text-ui-xs text-muted-foreground">
                  {server.tools.length}{" "}
                  {server.tools.length === 1 ? "tool" : "tools"}
                </span>
              ) : null}
              <ServerRowBadges server={server} shadowed={shadowed} />
            </button>
          </CollapsibleTrigger>

          <ServerRowActions
            serverName={server.name}
            serverEnabled={server.enabled}
            pending={pending}
            showLogin={showLogin}
            showLogout={showLogout}
            showForceReauth={showForceReauth}
            canRemove={canRemove}
            canToggleServer={canToggleServer}
            onLogin={onLogin}
            onLogout={onLogout}
            onForceReauth={onForceReauth}
            onRefresh={onRefresh}
            onDelete={onDelete}
            onToggleServer={onToggleServer}
          />
        </div>

        {server.statusDetail !== null &&
        (server.status === "error" || server.status === "needs_auth") ? (
          <p className="border-t border-border/40 px-3 py-2 text-ui-xs text-destructive">
            {redactLogText(server.statusDetail)}
          </p>
        ) : null}

        <CollapsibleContent>
          <div className="border-t border-border/40 px-3 py-2">
            {!toolsListable ? (
              <ToolsUnavailableState
                server={server}
                onLogin={
                  capabilities.authActions.includes("login") ? onLogin : null
                }
                onRefresh={onRefresh}
                pending={pending}
              />
            ) : (
              <ServerToolsPanel
                server={server}
                capabilities={capabilities}
                toolsReadOnly={toolsReadOnly}
                pending={pending}
                subTab={subTab}
                onSubTabChange={setSubTab}
                onToggleTool={onToggleTool}
                onToggleAllTools={onToggleAllTools}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function ServerRowBadges(props: {
  readonly server: ProviderMcpServer;
  readonly shadowed: boolean;
}): ReactNode {
  const { server, shadowed } = props;
  return (
    <>
      {shadowed ? (
        <Badge
          variant="outline"
          className="h-4 rounded-sm border-border/60 px-1.5 text-[10px] font-normal"
        >
          shadowed by project
        </Badge>
      ) : null}
      {server.statusSource === "probe" ? (
        <Badge
          variant="outline"
          className="h-4 rounded-sm border-border/60 px-1.5 text-[10px] font-normal text-muted-foreground"
        >
          connectivity check
        </Badge>
      ) : null}
      {server.configOnly ? (
        <Badge
          variant="outline"
          className="h-4 rounded-sm border-border/60 px-1.5 text-[10px] font-normal"
        >
          config only
        </Badge>
      ) : null}
      {server.stdioDegraded ? (
        <Badge
          variant="outline"
          className="h-4 rounded-sm border-border/60 px-1.5 text-[10px] font-normal"
        >
          stdio degraded
        </Badge>
      ) : null}
    </>
  );
}

function ServerRowActions(props: {
  readonly serverName: string;
  readonly serverEnabled: boolean;
  readonly pending: boolean;
  readonly showLogin: boolean;
  readonly showLogout: boolean;
  readonly showForceReauth: boolean;
  readonly canRemove: boolean;
  readonly canToggleServer: boolean;
  readonly onLogin: () => void;
  readonly onLogout: () => void;
  readonly onForceReauth: () => void;
  readonly onRefresh: () => void;
  readonly onDelete: () => void;
  readonly onToggleServer: (enabled: boolean) => void;
}): ReactNode {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {props.pending ? <MutedAgentSpinner /> : null}
      {props.showLogin ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={props.pending}
          onClick={props.onLogin}
        >
          <LogIn className="size-3.5" />
          Sign in
        </Button>
      ) : null}
      {props.showForceReauth ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={props.pending}
          onClick={props.onForceReauth}
        >
          Re-authenticate
        </Button>
      ) : null}
      {props.showLogout ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={props.pending}
          onClick={props.onLogout}
          aria-label={`Log out ${props.serverName}`}
        >
          <LogOut className="size-3.5" />
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={props.pending}
        onClick={props.onRefresh}
        aria-label={`Refresh ${props.serverName}`}
      >
        <RefreshCw className="size-3.5" />
      </Button>
      {props.canRemove ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={props.pending}
          onClick={props.onDelete}
          aria-label={`Delete ${props.serverName}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
      {props.canToggleServer ? (
        <Switch
          checked={props.serverEnabled}
          disabled={props.pending}
          onCheckedChange={props.onToggleServer}
          aria-label={
            props.serverEnabled
              ? `Disable ${props.serverName}`
              : `Enable ${props.serverName}`
          }
        />
      ) : null}
    </div>
  );
}

function ServerToolsPanel(props: {
  readonly server: ProviderMcpServer;
  readonly capabilities: ProviderMcpCapabilities;
  readonly toolsReadOnly: boolean;
  readonly pending: boolean;
  readonly subTab: "tools" | "instructions";
  readonly onSubTabChange: (tab: "tools" | "instructions") => void;
  readonly onToggleTool: (toolName: string, enabled: boolean) => void;
  readonly onToggleAllTools: (enabled: boolean) => void;
}): ReactNode {
  const {
    server,
    capabilities,
    toolsReadOnly,
    pending,
    subTab,
    onSubTabChange,
    onToggleTool,
    onToggleAllTools,
  } = props;

  return (
    <Tabs
      value={subTab}
      onValueChange={(value) => {
        if (value === "tools" || value === "instructions") {
          onSubTabChange(value);
        }
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <TabsList className="h-auto">
          <TabsTrigger value="tools" className="text-ui-xs">
            Tools ({server.tools.length})
          </TabsTrigger>
          {capabilities.instructionsSource !== "none" ? (
            <TabsTrigger value="instructions" className="text-ui-xs">
              Instructions
            </TabsTrigger>
          ) : null}
        </TabsList>
        {!toolsReadOnly && server.tools.length > 0 ? (
          <div className="ml-auto flex gap-2 text-ui-xs text-muted-foreground">
            <button
              type="button"
              className="hover:text-foreground"
              disabled={pending}
              onClick={() => {
                onToggleAllTools(true);
              }}
            >
              Enable all
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              disabled={pending}
              onClick={() => {
                onToggleAllTools(false);
              }}
            >
              Disable all
            </button>
          </div>
        ) : null}
      </div>
      <TabsContent value="tools" className="mt-0">
        {server.tools.length === 0 ? (
          <p className="py-3 text-center text-ui-xs text-muted-foreground">
            No tools discovered yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {server.tools.map((tool) => (
              <ToolChip
                key={tool.name}
                tool={tool}
                readOnly={toolsReadOnly || tool.readOnly}
                disabled={pending}
                onToggle={(enabled) => {
                  onToggleTool(tool.name, enabled);
                }}
              />
            ))}
          </div>
        )}
      </TabsContent>
      {capabilities.instructionsSource !== "none" ? (
        <TabsContent value="instructions" className="mt-0">
          {server.instructions === null ||
          server.instructions.trim().length === 0 ? (
            <p className="py-3 text-center text-ui-xs text-muted-foreground">
              No instructions from this server.
            </p>
          ) : (
            <pre className="max-h-[min(40vh,20rem)] overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 p-3 text-ui-xs text-muted-foreground">
              {server.instructions}
            </pre>
          )}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

function ToolsUnavailableState(props: {
  readonly server: ProviderMcpServer;
  readonly onLogin: (() => void) | null;
  readonly onRefresh: () => void;
  readonly pending: boolean;
}): ReactNode {
  const { server, onLogin, onRefresh, pending } = props;
  let message = "Tools are unavailable until this server is connected.";
  if (server.configOnly) {
    message =
      "This OAuth-gated server is config-only — manage it in the provider's native surface, or sign in if available.";
  } else if (server.stdioDegraded) {
    message =
      "Stdio is degraded for this provider — config is editable, but live tools are unavailable in-session.";
  } else if (server.status === "needs_auth") {
    message = "Sign in to discover tools for this server.";
  } else if (server.status === "error") {
    message =
      server.statusDetail !== null
        ? redactLogText(server.statusDetail)
        : "Connection failed. Retry to discover tools.";
  } else if (server.status === "connecting") {
    message = "Connecting…";
  } else if (!server.enabled) {
    message = "Enable this server to discover tools.";
  }

  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-ui-xs text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        {server.status === "needs_auth" && onLogin !== null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onLogin}
          >
            Sign in
          </Button>
        ) : null}
        {server.status === "error" || server.status === "disconnected" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onRefresh}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function toolAriaLabel(tool: ProviderMcpTool, readOnly: boolean): string {
  if (readOnly) return tool.name;
  if (tool.enabled) return `Disable tool ${tool.name}`;
  return `Enable tool ${tool.name}`;
}

function ToolChip(props: {
  readonly tool: ProviderMcpTool;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
}): ReactNode {
  const { tool, readOnly, disabled, onToggle } = props;
  const chip = (
    <button
      type="button"
      disabled={disabled || readOnly}
      onClick={() => {
        if (readOnly) return;
        onToggle(!tool.enabled);
      }}
      className={cn(
        "w-full truncate rounded-md border border-border/60 px-2.5 py-1.5 text-left text-ui-xs transition-colors",
        tool.enabled
          ? "bg-background text-foreground hover:bg-muted/40"
          : "bg-muted/20 text-muted-foreground line-through",
        readOnly ? "cursor-default" : "cursor-pointer",
        disabled ? "opacity-60" : null,
      )}
      aria-pressed={tool.enabled}
      aria-label={toolAriaLabel(tool, readOnly)}
    >
      {tool.name}
    </button>
  );

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[min(90vw,20rem)] max-h-[min(50vh,18rem)] overflow-auto p-3"
      >
        <div className="text-ui-sm font-medium text-foreground">
          {tool.name}
        </div>
        {tool.description !== null && tool.description.length > 0 ? (
          <p className="mt-1 text-ui-xs text-muted-foreground">
            {tool.description}
          </p>
        ) : (
          <p className="mt-1 text-ui-xs text-muted-foreground">
            No description.
          </p>
        )}
        <div className="mt-2 text-ui-xs font-medium text-foreground">
          Input Schema
        </div>
        <ToolSchemaBody schema={tool.inputSchema} />
      </HoverCardContent>
    </HoverCard>
  );
}

function ToolSchemaBody(props: {
  readonly schema: Record<string, unknown> | null;
}): ReactNode {
  if (props.schema === null) {
    return (
      <p className="mt-1 text-ui-xs text-muted-foreground">
        Schema not available.
      </p>
    );
  }
  const properties = props.schema.properties;
  const required = new Set(
    Array.isArray(props.schema.required)
      ? props.schema.required.filter((v): v is string => typeof v === "string")
      : [],
  );
  if (
    properties !== null &&
    typeof properties === "object" &&
    !Array.isArray(properties)
  ) {
    const entries = Object.entries(properties as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <p className="mt-1 text-ui-xs text-muted-foreground">No properties.</p>
      );
    }
    return (
      <ul className="mt-1 flex flex-col gap-1">
        {entries.map(([name, value]) => {
          const desc =
            value !== null &&
            typeof value === "object" &&
            "description" in value &&
            typeof value.description === "string"
              ? value.description
              : null;
          const isRequired = required.has(name);
          return (
            <li key={name} className="text-ui-xs text-muted-foreground">
              <span className="font-medium text-foreground">{name}</span>
              {isRequired ? <span className="text-destructive"> *</span> : null}
              {desc !== null ? ` — ${desc}` : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <pre className="mt-1 max-h-[min(30vh,12rem)] overflow-auto whitespace-pre-wrap text-ui-xs text-muted-foreground">
      {JSON.stringify(props.schema, null, 2)}
    </pre>
  );
}

function statusDotClass(
  status: ProviderMcpServerStatus,
  pending: boolean,
): string {
  if (pending || status === "connecting") return "animate-pulse bg-amber-500";
  if (status === "connected") return "bg-emerald-500";
  if (status === "needs_auth" || status === "error") return "bg-destructive";
  return "bg-muted-foreground/50";
}

function StatusDot(props: {
  readonly status: ProviderMcpServerStatus;
  readonly pending: boolean;
}): ReactNode {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        statusDotClass(props.status, props.pending),
      )}
    />
  );
}

function statusLabelFor(server: ProviderMcpServer): string {
  if (server.discoveryPending || server.status === "connecting") {
    return "Connecting…";
  }
  if (!server.enabled) return "Disabled";
  switch (server.status) {
    case "connected":
      return server.statusSource === "probe" ? "Reachable" : "Connected";
    case "needs_auth":
      return "Needs auth";
    case "error":
      return "Error";
    case "disconnected":
      return "Disconnected";
    case "config_only":
      return "Config only";
    case "unknown":
      return "Unknown";
  }
}
