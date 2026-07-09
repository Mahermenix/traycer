import type { UseQueryResult } from "@tanstack/react-query";
import type {
  HostRpcError,
  ResponseOfMethod,
} from "@traycer-clients/shared/host-transport/host-messenger";
import type { ProviderId } from "@traycer/protocol/host/provider-schemas";
import type { ProviderNativeScope } from "@traycer/protocol/host/provider-native-schemas";
import { useHostClient, type HostRpcRegistry } from "@/lib/host";
import { useHostQuery } from "@/hooks/host/use-host-query";

const MCP_LIST_PENDING_REFRESH_MS = 800;

export function useProvidersMcpList(args: {
  readonly providerId: ProviderId;
  readonly scope: ProviderNativeScope;
  readonly workspaceRoot: string | null;
  readonly enabled: boolean;
  readonly pollWhilePending: boolean;
}): UseQueryResult<
  ResponseOfMethod<HostRpcRegistry, "providers.mcpList">,
  HostRpcError
> {
  const client = useHostClient();
  return useHostQuery<HostRpcRegistry, "providers.mcpList">({
    cacheKeyIdentity: undefined,
    client,
    method: "providers.mcpList",
    params: {
      providerId: args.providerId,
      scope: args.scope,
      workspaceRoot: args.workspaceRoot,
    },
    options: {
      enabled: args.enabled,
      staleTime: 30_000,
      refetchInterval: (query) => {
        if (args.pollWhilePending) return MCP_LIST_PENDING_REFRESH_MS;
        const servers = query.state.data?.servers;
        if (servers === undefined) return false;
        const needsPoll = servers.some(
          (server) => server.discoveryPending || server.status === "connecting",
        );
        return needsPoll ? MCP_LIST_PENDING_REFRESH_MS : false;
      },
    },
  });
}
