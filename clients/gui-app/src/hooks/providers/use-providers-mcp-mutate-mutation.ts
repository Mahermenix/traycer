import type { UseMutationResult } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type {
  HostRpcError,
  RequestOfMethod,
  ResponseOfMethod,
} from "@traycer-clients/shared/host-transport/host-messenger";
import { useHostClient, type HostRpcRegistry } from "@/lib/host";
import { useHostMutation } from "@/hooks/host/use-host-query";
import { hostQueryKeys, providersMutationKeys } from "@/lib/query-keys";
import { toastFromHostError } from "@/lib/host-error-toast";

type McpMutateRequest = RequestOfMethod<HostRpcRegistry, "providers.mcpMutate">;
type McpMutateResponse = ResponseOfMethod<
  HostRpcRegistry,
  "providers.mcpMutate"
>;
type McpListResponse = ResponseOfMethod<HostRpcRegistry, "providers.mcpList">;

interface McpMutateContext {
  readonly hostId: string | null;
  readonly previousServers: McpListResponse | undefined;
  readonly listParams: {
    readonly providerId: McpMutateRequest["providerId"];
    readonly scope: McpMutateRequest["scope"];
    readonly workspaceRoot: McpMutateRequest["workspaceRoot"];
  };
}

/**
 * Mutates MCP config and writes the returned full server list into the
 * matching `providers.mcpList` cache entry. Response-equals-state: the host
 * always returns the post-mutation list for the scope tuple.
 */
export function useProvidersMcpMutate(): UseMutationResult<
  McpMutateResponse,
  HostRpcError,
  McpMutateRequest,
  McpMutateContext
> {
  const client = useHostClient();
  const queryClient = useQueryClient();
  return useHostMutation<
    HostRpcRegistry,
    "providers.mcpMutate",
    McpMutateContext
  >({
    client,
    method: "providers.mcpMutate",
    mapVariables: (variables) => variables,
    options: {
      mutationKey: providersMutationKeys.mcpMutate(),
      onMutate: (variables) => {
        const hostId = client.getActiveHostId();
        const listParams = {
          providerId: variables.providerId,
          scope: variables.scope,
          workspaceRoot: variables.workspaceRoot,
        };
        const listKey = hostQueryKeys.method<
          HostRpcRegistry,
          "providers.mcpList"
        >(hostId, "providers.mcpList", listParams);
        const previousServers =
          queryClient.getQueryData<McpListResponse>(listKey);

        if (
          previousServers !== undefined &&
          variables.mutation.action === "toggleTool"
        ) {
          const { serverName, toolName, enabled } = variables.mutation;
          queryClient.setQueryData<McpListResponse>(listKey, {
            servers: previousServers.servers.map((server) => {
              if (server.name !== serverName) return server;
              return {
                ...server,
                tools: server.tools.map((tool) =>
                  tool.name === toolName ? { ...tool, enabled } : tool,
                ),
              };
            }),
          });
        }

        if (
          previousServers !== undefined &&
          variables.mutation.action === "toggleServer"
        ) {
          const { name, enabled } = variables.mutation;
          queryClient.setQueryData<McpListResponse>(listKey, {
            servers: previousServers.servers.map((server) =>
              server.name === name ? { ...server, enabled } : server,
            ),
          });
        }

        return { hostId, previousServers, listParams };
      },
      onSuccess: (data, _variables, ctx) => {
        if (ctx.hostId === null) return;
        queryClient.setQueryData<McpListResponse>(
          hostQueryKeys.method<HostRpcRegistry, "providers.mcpList">(
            ctx.hostId,
            "providers.mcpList",
            ctx.listParams,
          ),
          { servers: data.servers },
        );
      },
      onError: (error, _variables, ctx) => {
        if (ctx !== undefined && ctx.hostId !== null) {
          queryClient.setQueryData(
            hostQueryKeys.method<HostRpcRegistry, "providers.mcpList">(
              ctx.hostId,
              "providers.mcpList",
              ctx.listParams,
            ),
            ctx.previousServers,
          );
        }
        toastFromHostError(error, "Couldn't update MCP server.");
      },
    },
  });
}
