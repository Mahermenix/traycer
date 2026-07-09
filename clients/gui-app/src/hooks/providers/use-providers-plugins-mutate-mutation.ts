import type { UseMutationResult } from "@tanstack/react-query";
import type {
  HostRpcError,
  RequestOfMethod,
  ResponseOfMethod,
} from "@traycer-clients/shared/host-transport/host-messenger";
import type { HostRpcRegistry } from "@/lib/host";
import { useHostScopedMutation } from "@/hooks/host/use-host-scoped-mutation";
import { providersMutationKeys } from "@/lib/query-keys";

export function useProvidersPluginsMutate(): UseMutationResult<
  ResponseOfMethod<HostRpcRegistry, "providers.pluginsMutate">,
  HostRpcError,
  RequestOfMethod<HostRpcRegistry, "providers.pluginsMutate">,
  { readonly hostId: string | null }
> {
  return useHostScopedMutation({
    method: "providers.pluginsMutate",
    mutationKey: providersMutationKeys.pluginsMutate(),
    errorMessage: "Couldn't update plugins.",
    invalidateMethods: ["providers.pluginsList"],
  });
}
