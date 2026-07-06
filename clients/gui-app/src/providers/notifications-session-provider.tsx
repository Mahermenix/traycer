import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { IHostStreamClient } from "@traycer-clients/shared/host-transport/host-stream-client";
import { NotificationsStreamClient } from "@traycer-clients/shared/host-transport/notifications-stream-client";
import type { HostStreamRpcRegistry } from "@traycer/protocol/host/registry";
import { useHostStreamClientFor } from "@/hooks/host/use-host-stream-client-for";
import { useStreamAuthRevalidator } from "@/lib/host/stream-auth-revalidator";
import {
  openNotificationsStream,
  useNotificationsStore,
} from "@/stores/notifications/notifications-store";
import { getNotificationsStreamFactoryOverride } from "@/providers/notifications-stream-factory-override";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useAuthService } from "@/lib/host";
import { useReactiveLocalHostEntry } from "@/hooks/host/use-reactive-local-host-entry";
import {
  useAuthIdentityTransition,
  type AuthIdentityTransition,
} from "@/hooks/auth/use-auth-identity-transition";

export interface NotificationsSessionProviderProps {
  readonly children: ReactNode;
}

/**
 * Mounted inside the app shell post-auth. Opens the notifications stream as
 * soon as the user is signed in and tears it down on sign-out / token
 * expiry. On sign-out - and on transitions between two distinct signed-in
 * users - the local notifications replica is reset so the incoming user
 * does not see the previous user's entries.
 *
 * Per the G8 decision, notifications always come from the **local host** -
 * never whichever host happens to be active in a composer/tab elsewhere in
 * the app. The stream is therefore bound to `useReactiveLocalHostEntry()` (a
 * transient, non-rebinding client via `useHostStreamClientFor`), not
 * `useReactiveActiveHostId()` / the app-wide `useWsStreamClient()`.
 */
export function NotificationsSessionProvider(
  props: NotificationsSessionProviderProps,
): ReactNode {
  const localHostEntry = useReactiveLocalHostEntry();
  const streamAuth = useStreamAuthRevalidator();
  const localStreamClient = useHostStreamClientFor(localHostEntry, streamAuth);
  const authService = useAuthService();
  const status = useAuthStore((state) => state.status);
  const email = useAuthStore((state) => state.profile?.email ?? null);
  const disposerRef = useRef<(() => void) | null>(null);
  const previousStreamClientRef =
    useRef<IHostStreamClient<HostStreamRpcRegistry> | null>(localStreamClient);

  const tearDown = useCallback((): void => {
    if (disposerRef.current === null) {
      return;
    }
    const disposer = disposerRef.current;
    disposerRef.current = null;
    disposer();
  }, []);

  const resetReplica = useCallback((): void => {
    useNotificationsStore.getState().reset();
  }, []);

  const openForCurrentUser = useCallback((): void => {
    if (
      getNotificationsStreamFactoryOverride() === null &&
      localStreamClient === null
    ) {
      return;
    }
    // Same recovery contract as EpicSessionProvider: an `UNAUTHORIZED`
    // terminal close means the host couldn't accept the current context
    // bearer. Re-validate against AuthnV3 so the cascade either rotates the
    // context credentials (transient) or tears the session down via sign-out.
    const onAuthError = (): void => {
      void authService.revalidateCurrentContext();
    };
    disposerRef.current = openNotificationsStream((callbacks) => {
      const override = getNotificationsStreamFactoryOverride();
      if (override !== null) {
        return override(callbacks);
      }
      if (localStreamClient === null) {
        throw new Error(
          "NotificationsSessionProvider: local host stream client missing at open time.",
        );
      }
      return new NotificationsStreamClient({
        wsStreamClient: localStreamClient,
        callbacks,
      });
    }, onAuthError);
  }, [localStreamClient, authService]);

  // Auth identity transitions own the replica-reset responsibility: sign-out
  // and user-switch both require wiping the prior-user Y.Doc before the next
  // `openForCurrentUser()` lands a fresh snapshot over empty state.
  const onAuthTransition = useCallback(
    (transition: AuthIdentityTransition) => {
      if (
        transition.kind === "signedOut" ||
        transition.kind === "userSwitched"
      ) {
        tearDown();
        resetReplica();
      }
    },
    [tearDown, resetReplica],
  );
  useAuthIdentityTransition(status, email, onAuthTransition);

  // Open / reopen the stream on signed-in + local-host-client transitions.
  // `localStreamClient` flips to `null` when there is no local host (browser/
  // mobile shells) or the local host's IPC channel drops - we teardown so the
  // next reconnect lands on a fresh client. It becomes a NEW object when the
  // local host respawns at a fresh endpoint under the SAME `hostId`
  // (`useHostStreamClientFor` rebuilds the transport on an endpoint move) -
  // that reference change, not a `hostId` comparison, is what drives
  // teardown/reopen here, so a respawn is followed even though "the local
  // host" identity never changed. Switching the app-wide ACTIVE host leaves
  // `localStreamClient` untouched, so this effect intentionally does not
  // re-run for that transition (per the G8 decision).
  useEffect(() => {
    const isSignedIn = status === "signed-in";
    const priorStreamClient = previousStreamClientRef.current;
    previousStreamClientRef.current = localStreamClient;

    if (!isSignedIn) {
      // `useAuthIdentityTransition`'s onTransition already tore down on the
      // signedOut path; no-op here.
      return;
    }
    if (localStreamClient === null) {
      tearDown();
      resetReplica();
      return;
    }
    if (priorStreamClient !== null && priorStreamClient !== localStreamClient) {
      tearDown();
      resetReplica();
    }
    if (disposerRef.current === null) {
      openForCurrentUser();
    }
  }, [
    localStreamClient,
    status,
    email,
    tearDown,
    resetReplica,
    openForCurrentUser,
  ]);

  useEffect(() => {
    return () => {
      tearDown();
    };
  }, [tearDown]);

  return <>{props.children}</>;
}
