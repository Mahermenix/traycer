import { useCallback } from "react";
import {
  useIsMutating,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { HostRpcError } from "@traycer-clients/shared/host-transport/host-messenger";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import type { HostDirectoryEntry } from "@traycer-clients/shared/host-client/host-directory";
import type {
  PrepareWorkspaceFoldersRequest,
  PrepareWorkspaceFoldersResponse,
  PreparedWorkspaceFolder,
  RemoveEpicRepoRequest,
  RemoveEpicRepoResponse,
} from "@traycer/protocol/host/epic/unary-schemas";
import type { HostRpcRegistry } from "@/lib/host";
import { useHostClient } from "@/lib/host/runtime";
import { useHostMutation } from "@/hooks/host/use-host-query";
import {
  hostQueryKeys,
  isCloudEpicTasksQueryKey,
  workspaceMutationKeys,
} from "@/lib/query-keys";
import { useRunnerHost } from "@/providers/use-runner-host";
import type { WorkspaceFolderInfo } from "@/stores/workspace/workspace-folders-store";

interface MutationContext {
  readonly hostId: string | null;
}

/**
 * Result of a user-initiated folder pick+prepare. `hostId` is the host that
 * was bound at dispatch (and re-validated after every await) — callers MUST
 * stamp folder rows with this value, never re-read the mutable client.
 */
export type PrepareFoldersWithHostResult = {
  readonly folders: readonly PreparedWorkspaceFolder[];
  readonly repoIdentifiers: PrepareWorkspaceFoldersResponse["repoIdentifiers"];
  readonly hostId: string;
};

export interface WorkspaceFolderActions {
  readonly isPreparing: boolean;
  readonly isRemoving: boolean;
  readonly prepareFoldersMutation: UseMutationResult<
    PrepareWorkspaceFoldersResponse,
    HostRpcError,
    PrepareWorkspaceFoldersRequest,
    MutationContext
  >;
  readonly removeEpicRepoMutation: UseMutationResult<
    RemoveEpicRepoResponse,
    HostRpcError,
    RemoveEpicRepoRequest,
    MutationContext
  >;
  readonly pickAndPrepareFolders: () => Promise<PrepareFoldersWithHostResult | null>;
}

export function useWorkspaceFolderActions(): WorkspaceFolderActions {
  const client = useHostClient();
  return useWorkspaceFolderActionsForClient(client);
}

export function useWorkspaceFolderActionsForClient(
  client: HostClient<HostRpcRegistry> | null,
): WorkspaceFolderActions {
  const runnerHost = useRunnerHost();
  const queryClient = useQueryClient();

  const prepareFoldersMutation = useHostMutation<
    HostRpcRegistry,
    "workspace.prepareFolders",
    MutationContext
  >({
    client,
    method: "workspace.prepareFolders",
    mapVariables: (variables) => variables,
    options: {
      mutationKey: workspaceMutationKeys.prepareFolders(),
      onMutate: () => ({ hostId: client?.getActiveHostId() ?? null }),
      // No success toast: added folders appear immediately in the picker rows.
      onError: (error) => {
        toast.error("Couldn't add folders", {
          description: readWorkspaceActionErrorMessage(error),
        });
      },
    },
  });

  const removeEpicRepoMutation = useHostMutation<
    HostRpcRegistry,
    "epic.removeRepo",
    MutationContext
  >({
    client,
    method: "epic.removeRepo",
    mapVariables: (variables) => variables,
    options: {
      mutationKey: workspaceMutationKeys.removeEpicRepo(),
      onMutate: () => ({ hostId: client?.getActiveHostId() ?? null }),
      onSuccess: async (_result, _variables, context) => {
        await queryClient.invalidateQueries({
          queryKey: hostQueryKeys.scope(context.hostId),
          predicate: (query) => !isCloudEpicTasksQueryKey(query.queryKey),
        });
      },
      onError: (error) => {
        toast.error("Couldn't remove repository from epic", {
          description: readWorkspaceActionErrorMessage(error),
        });
      },
    },
  });

  const preparePending =
    useIsMutating({ mutationKey: workspaceMutationKeys.prepareFolders() }) > 0;
  const removeRepoPending =
    useIsMutating({ mutationKey: workspaceMutationKeys.removeEpicRepo() }) > 0;

  const { mutateAsync: prepareFoldersAsync } = prepareFoldersMutation;

  const pickAndPrepareFolders = useCallback(async () => {
    // Capture host identity at dispatch. Every post-await re-read must match
    // this id; otherwise refuse so we never stamp A-prepared paths as B.
    const dispatchHost = client?.getActiveHost() ?? null;
    if (!canAssociateLocalWorkspaces(dispatchHost)) {
      toast.error("Select the local host to add folders.");
      return null;
    }
    const dispatchHostId = dispatchHost.hostId;

    const folderPaths = await runnerHost.workspaceFolders.pickFolders();
    if (folderPaths.length === 0) {
      return null;
    }
    if (!hostStillBound(client, dispatchHostId)) {
      toast.error("Host changed while choosing folders. Try again.");
      return null;
    }

    const response = await prepareFoldersAsync({
      folderPaths: [...folderPaths],
    }).catch(() => null);
    if (response === null) {
      return null;
    }
    if (!hostStillBound(client, dispatchHostId)) {
      toast.error("Host changed while adding folders. Try again.");
      return null;
    }

    return {
      folders: response.folders,
      repoIdentifiers: response.repoIdentifiers,
      hostId: dispatchHostId,
    };
  }, [client, runnerHost, prepareFoldersAsync]);

  return {
    isPreparing: preparePending,
    isRemoving: removeRepoPending,
    prepareFoldersMutation,
    removeEpicRepoMutation,
    pickAndPrepareFolders,
  };
}

export function preparedWorkspaceFolderToWorkspaceFolderInfo(
  folder: PreparedWorkspaceFolder,
  hostId: string | null,
): WorkspaceFolderInfo {
  return {
    path: folder.workspacePath,
    name: folder.workspaceName,
    repoIdentifier: folder.repoIdentifier,
    hostId,
  };
}

function hostStillBound(
  client: HostClient<HostRpcRegistry> | null,
  dispatchHostId: string,
): boolean {
  if (client === null) return false;
  return client.getActiveHostId() === dispatchHostId;
}

function canAssociateLocalWorkspaces(
  activeHost: HostDirectoryEntry | null,
): activeHost is HostDirectoryEntry & {
  readonly kind: "local" | "mock";
} {
  return (
    activeHost !== null &&
    (activeHost.kind === "local" || activeHost.kind === "mock")
  );
}

function readWorkspaceActionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Pure helper for tests: stamp prepared folders with a dispatch-time host id.
 * Mirrors the production post-prepare mapping without re-reading a client.
 */
export function stampPreparedFoldersWithDispatchHost(
  folders: readonly PreparedWorkspaceFolder[],
  dispatchHostId: string,
): readonly WorkspaceFolderInfo[] {
  return folders.map((folder) =>
    preparedWorkspaceFolderToWorkspaceFolderInfo(folder, dispatchHostId),
  );
}
