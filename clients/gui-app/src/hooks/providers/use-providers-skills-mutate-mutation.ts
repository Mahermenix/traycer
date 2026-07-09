import type { UseMutationResult } from "@tanstack/react-query";
import type {
  HostRpcError,
  RequestOfMethod,
  ResponseOfMethod,
} from "@traycer-clients/shared/host-transport/host-messenger";
import type { HostRpcRegistry } from "@/lib/host";
import { useHostScopedMutation } from "@/hooks/host/use-host-scoped-mutation";
import { providersMutationKeys } from "@/lib/query-keys";

export function useProvidersSkillsMutate(): UseMutationResult<
  ResponseOfMethod<HostRpcRegistry, "providers.skillsMutate">,
  HostRpcError,
  RequestOfMethod<HostRpcRegistry, "providers.skillsMutate">,
  { readonly hostId: string | null }
> {
  return useHostScopedMutation({
    method: "providers.skillsMutate",
    mutationKey: providersMutationKeys.skillsMutate(),
    errorMessage: "Couldn't update skills.",
    invalidateMethods: ["providers.skillsList"],
  });
}
