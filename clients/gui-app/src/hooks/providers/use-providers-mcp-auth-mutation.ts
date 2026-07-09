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

type McpAuthRequest = RequestOfMethod<HostRpcRegistry, "providers.mcpAuth">;
type McpAuthResponse = ResponseOfMethod<HostRpcRegistry, "providers.mcpAuth">;

interface McpAuthContext {
  readonly hostId: string | null;
  readonly listParams: {
    readonly providerId: McpAuthRequest["providerId"];
    readonly scope: McpAuthRequest["scope"];
    readonly workspaceRoot: McpAuthRequest["workspaceRoot"];
  };
}

/**
 * Starts an MCP auth action. Callers open `authorizationUrl` when returned
 * and rely on `providers.mcpList` polling for settlement. Success
 * invalidates the list so status dots update promptly.
 */
export function useProvidersMcpAuth(): UseMutationResult<
  McpAuthResponse,
  HostRpcError,
  McpAuthRequest,
  McpAuthContext
> {
  const client = useHostClient();
  const queryClient = useQueryClient();
  return useHostMutation<HostRpcRegistry, "providers.mcpAuth", McpAuthContext>({
    client,
    method: "providers.mcpAuth",
    mapVariables: (variables) => variables,
    options: {
      mutationKey: providersMutationKeys.mcpAuth(),
      onMutate: (variables) => ({
        hostId: client.getActiveHostId(),
        listParams: {
          providerId: variables.providerId,
          scope: variables.scope,
          workspaceRoot: variables.workspaceRoot,
        },
      }),
      onSuccess: (_data, _variables, ctx) => {
        if (ctx.hostId === null) return;
        void queryClient.invalidateQueries({
          queryKey: hostQueryKeys.methodScope(ctx.hostId, "providers.mcpList"),
        });
      },
      onError: (error) =>
        toastFromHostError(error, "Couldn't complete MCP authentication."),
    },
  });
}
