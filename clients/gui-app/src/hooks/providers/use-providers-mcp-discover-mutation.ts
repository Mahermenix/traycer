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

type McpDiscoverRequest = RequestOfMethod<
  HostRpcRegistry,
  "providers.mcpDiscover"
>;
type McpDiscoverResponse = ResponseOfMethod<
  HostRpcRegistry,
  "providers.mcpDiscover"
>;
type McpListResponse = ResponseOfMethod<HostRpcRegistry, "providers.mcpList">;

interface McpDiscoverContext {
  readonly hostId: string | null;
  readonly listParams: {
    readonly providerId: McpDiscoverRequest["providerId"];
    readonly scope: McpDiscoverRequest["scope"];
    readonly workspaceRoot: McpDiscoverRequest["workspaceRoot"];
  };
}

/**
 * Discovers tools/schemas/instructions for one server and merges the
 * returned row into the matching `providers.mcpList` cache entry.
 */
export function useProvidersMcpDiscover(): UseMutationResult<
  McpDiscoverResponse,
  HostRpcError,
  McpDiscoverRequest,
  McpDiscoverContext
> {
  const client = useHostClient();
  const queryClient = useQueryClient();
  return useHostMutation<
    HostRpcRegistry,
    "providers.mcpDiscover",
    McpDiscoverContext
  >({
    client,
    method: "providers.mcpDiscover",
    mapVariables: (variables) => variables,
    options: {
      mutationKey: providersMutationKeys.mcpDiscover(),
      onMutate: (variables) => ({
        hostId: client.getActiveHostId(),
        listParams: {
          providerId: variables.providerId,
          scope: variables.scope,
          workspaceRoot: variables.workspaceRoot,
        },
      }),
      onSuccess: (data, _variables, ctx) => {
        if (ctx.hostId === null) return;
        const listKey = hostQueryKeys.method<
          HostRpcRegistry,
          "providers.mcpList"
        >(ctx.hostId, "providers.mcpList", ctx.listParams);
        queryClient.setQueryData<McpListResponse>(listKey, (prev) => {
          if (prev === undefined) {
            return { servers: [data.server] };
          }
          const found = prev.servers.some(
            (server) => server.name === data.server.name,
          );
          if (!found) {
            return { servers: [...prev.servers, data.server] };
          }
          return {
            servers: prev.servers.map((server) =>
              server.name === data.server.name ? data.server : server,
            ),
          };
        });
      },
      onError: (error) =>
        toastFromHostError(error, "Couldn't refresh MCP server tools."),
    },
  });
}
