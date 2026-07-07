import "../../../../../__tests__/test-browser-apis";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

type GuideData = {
  readonly content: string;
  readonly generatedDefaultContent: string;
};

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
};

const guideMocks = vi.hoisted(
  (): {
    activeHostId: string;
    scopedHostId: string;
    queryData: GuideData | undefined;
    queryDataByHost: Record<string, GuideData>;
    queryIsError: boolean;
    setGlobalMutateAsync: Mock<
      (input: { readonly content: string }) => Promise<GuideData>
    >;
    resetGlobalMutateAsync: Mock<
      (input: Record<string, never>) => Promise<GuideData>
    >;
    setGlobalHostIds: string[];
    resetGlobalHostIds: string[];
    lastTransientTarget: { readonly hostId: string } | null;
    directoryEntries: ReadonlyArray<{
      readonly hostId: string;
      readonly label: string;
      readonly status: string;
      readonly websocketUrl: string;
    }>;
  } => ({
    activeHostId: "local",
    scopedHostId: "local",
    queryData: {
      content: "claude guide",
      generatedDefaultContent: "claude guide",
    },
    queryDataByHost: {},
    queryIsError: false,
    setGlobalMutateAsync: vi.fn(),
    resetGlobalMutateAsync: vi.fn(),
    setGlobalHostIds: [],
    resetGlobalHostIds: [],
    lastTransientTarget: null,
    directoryEntries: [
      {
        hostId: "local",
        label: "Local host",
        status: "available",
        websocketUrl: "ws://local.invalid",
      },
      {
        hostId: "remote",
        label: "Remote host",
        status: "available",
        websocketUrl: "ws://remote.invalid",
      },
    ],
  }),
);

vi.mock("@/hooks/host/use-reactive-active-host-id", () => ({
  useReactiveActiveHostId: () => guideMocks.activeHostId,
}));

vi.mock("@/hooks/host/use-host-directory-list-query", () => ({
  useHostDirectoryList: () => ({ data: guideMocks.directoryEntries }),
}));

vi.mock("@/hooks/host/use-host-client-for", () => ({
  useHostClientFor: (target: { readonly hostId: string } | null) => {
    guideMocks.lastTransientTarget = target;
    guideMocks.scopedHostId =
      target === null ? guideMocks.activeHostId : target.hostId;
    if (target === null) return null;
    return {
      getActiveHostId: () => target.hostId,
    };
  },
}));

function requireHostId(hostId: string | null): string {
  if (hostId === null) {
    throw new Error("expected host id");
  }
  return hostId;
}

vi.mock("@/lib/host/runtime", async (importOriginal) => {
  const react = await import("react");
  const actual = await importOriginal<typeof import("@/lib/host/runtime")>();
  const defaultBinding = {
    hostClient: {
      getActiveHostId: () => guideMocks.activeHostId,
    },
    directory: { refresh: () => Promise.resolve([]) },
  };
  const useHostBinding = () =>
    react.useContext(actual.HostRuntimeContext) ?? defaultBinding;
  return {
    ...actual,
    useHostBinding,
    useHostClient: () => useHostBinding().hostClient,
  };
});

vi.mock("@/hooks/agent/use-agent-selection-guide-global-query", async () => {
  const runtime = await import("@/lib/host/runtime");
  return {
    useAgentSelectionGuideGlobalQuery: () => {
      const hostId = requireHostId(runtime.useHostClient().getActiveHostId());
      return {
        data: guideMocks.queryDataByHost[hostId] ?? guideMocks.queryData,
        isError: guideMocks.queryIsError,
      };
    },
  };
});

vi.mock(
  "@/hooks/agent/use-agent-selection-guide-set-global-mutation",
  async () => {
    const runtime = await import("@/lib/host/runtime");
    return {
      useAgentSelectionGuideSetGlobalMutation: () => {
        const hostId = requireHostId(runtime.useHostClient().getActiveHostId());
        return {
          mutateAsync: (input: { readonly content: string }) => {
            guideMocks.setGlobalHostIds.push(hostId);
            return guideMocks.setGlobalMutateAsync(input);
          },
        };
      },
    };
  },
);

vi.mock(
  "@/hooks/agent/use-agent-selection-guide-reset-global-mutation",
  async () => {
    const runtime = await import("@/lib/host/runtime");
    return {
      useAgentSelectionGuideResetGlobalMutation: () => {
        const hostId = requireHostId(runtime.useHostClient().getActiveHostId());
        return {
          mutateAsync: (input: Record<string, never>) => {
            guideMocks.resetGlobalHostIds.push(hostId);
            return guideMocks.resetGlobalMutateAsync(input);
          },
        };
      },
    };
  },
);

import { AgentSelectionGuideSection } from "@/components/settings/panels/agent-selection-guide-section";

function renderPanel() {
  return render(
    <StrictMode>
      <span
        aria-hidden
        data-testid="active-host-probe"
        data-bound-host-id={guideMocks.activeHostId}
      />
      <AgentSelectionGuideSection />
    </StrictMode>,
  );
}

function strictPanel() {
  return (
    <StrictMode>
      <span
        aria-hidden
        data-testid="active-host-probe"
        data-bound-host-id={guideMocks.activeHostId}
      />
      <AgentSelectionGuideSection />
    </StrictMode>
  );
}

describe("AgentSelectionGuideSection", () => {
  beforeEach(() => {
    guideMocks.queryData = {
      content: "claude guide",
      generatedDefaultContent: "claude guide",
    };
    guideMocks.queryDataByHost = {};
    guideMocks.queryIsError = false;
    guideMocks.activeHostId = "local";
    guideMocks.scopedHostId = "local";
    guideMocks.lastTransientTarget = null;
    guideMocks.setGlobalHostIds = [];
    guideMocks.resetGlobalHostIds = [];
    guideMocks.directoryEntries = [
      {
        hostId: "local",
        label: "Local host",
        status: "available",
        websocketUrl: "ws://local.invalid",
      },
      {
        hostId: "remote",
        label: "Remote host",
        status: "available",
        websocketUrl: "ws://remote.invalid",
      },
    ];
    guideMocks.setGlobalMutateAsync.mockReset();
    guideMocks.setGlobalMutateAsync.mockResolvedValue({
      content: "claude guide",
      generatedDefaultContent: "claude guide",
    });
    guideMocks.resetGlobalMutateAsync.mockReset();
    guideMocks.resetGlobalMutateAsync.mockResolvedValue({
      content: "codex guide",
      generatedDefaultContent: "codex guide",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("updates generated defaults without clobbering the active editor draft", async () => {
    const { rerender } = renderPanel();
    const editor = screen.getByTestId<HTMLTextAreaElement>(
      "agents-selection-guide-input",
    );
    const revert = screen.getByTestId<HTMLButtonElement>(
      "agents-selection-guide-revert",
    );

    expect(editor.value).toBe("claude guide");
    expect(revert.disabled).toBe(true);

    guideMocks.queryData = {
      content: "claude guide",
      generatedDefaultContent: "codex guide",
    };
    rerender(strictPanel());

    await waitFor(() => {
      expect(editor.value).toBe("claude guide");
      expect(revert.disabled).toBe(false);
    });
    expect(guideMocks.setGlobalMutateAsync).not.toHaveBeenCalled();
    expect(guideMocks.resetGlobalMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the load failure instead of a skeleton when the first guide fetch fails", () => {
    guideMocks.queryData = undefined;
    guideMocks.queryIsError = true;

    renderPanel();

    expect(
      screen.getByText("Couldn't load agent instructions for this host."),
    ).toBeTruthy();
    expect(screen.queryByTestId("agents-selection-guide-input")).toBeNull();
  });

  it("switches the guide editor host without changing the app-wide active host", async () => {
    guideMocks.queryDataByHost = {
      local: {
        content: "local guide",
        generatedDefaultContent: "local guide",
      },
      remote: {
        content: "remote guide",
        generatedDefaultContent: "remote guide",
      },
    };
    renderPanel();

    expect(
      screen
        .getByTestId("active-host-probe")
        .getAttribute("data-bound-host-id"),
    ).toBe("local");
    expect(
      screen.getByTestId<HTMLTextAreaElement>("agents-selection-guide-input")
        .value,
    ).toBe("local guide");

    fireEvent.click(
      screen.getByRole("combobox", { name: "Agent instructions host" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Remote host" }));

    await waitFor(() => {
      expect(guideMocks.lastTransientTarget?.hostId).toBe("remote");
      expect(
        screen.getByTestId<HTMLTextAreaElement>("agents-selection-guide-input")
          .value,
      ).toBe("remote guide");
    });
    expect(
      screen
        .getByTestId("active-host-probe")
        .getAttribute("data-bound-host-id"),
    ).toBe("local");

    fireEvent.change(screen.getByTestId("agents-selection-guide-input"), {
      target: { value: "remote edit" },
    });
    fireEvent.blur(screen.getByTestId("agents-selection-guide-input"));

    await waitFor(() => {
      expect(guideMocks.setGlobalMutateAsync).toHaveBeenCalledWith({
        content: "remote edit",
      });
    });
    expect(guideMocks.setGlobalHostIds[0]).toBe("remote");
  });

  it("shows an unavailable notice and stops reading through the active host once the picked host vanishes", async () => {
    guideMocks.queryDataByHost = {
      local: { content: "local guide", generatedDefaultContent: "local guide" },
      remote: {
        content: "remote guide",
        generatedDefaultContent: "remote guide",
      },
    };
    const { rerender } = renderPanel();

    fireEvent.click(
      screen.getByRole("combobox", { name: "Agent instructions host" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Remote host" }));

    await waitFor(() => {
      expect(guideMocks.lastTransientTarget?.hostId).toBe("remote");
    });

    // The picked host is deregistered - it drops out of the directory
    // entirely, not merely marked unavailable while still listed.
    guideMocks.directoryEntries = [guideMocks.directoryEntries[0]];
    rerender(strictPanel());

    await waitFor(() => {
      expect(
        screen.getByText(
          "remote is no longer available. Pick a different host above.",
        ),
      ).toBeTruthy();
    });
    // The stale local-scoped editor from before the pick must not remain
    // mounted, silently reading/writing through the active host's client.
    expect(screen.queryByTestId("agents-selection-guide-input")).toBeNull();
  });

  it("reverts through the host reset API instead of sending generated content back", async () => {
    guideMocks.queryData = {
      content: "claude guide",
      generatedDefaultContent: "codex guide",
    };
    renderPanel();

    fireEvent.click(screen.getByTestId("agents-selection-guide-revert"));
    fireEvent.click(screen.getByTestId("confirm-action"));

    await waitFor(() => {
      expect(
        screen.getByTestId<HTMLTextAreaElement>("agents-selection-guide-input")
          .value,
      ).toBe("codex guide");
    });
    expect(guideMocks.resetGlobalMutateAsync).toHaveBeenCalledWith({});
    expect(guideMocks.setGlobalMutateAsync).not.toHaveBeenCalled();
  });

  it("serializes saves so a later edit waits for an earlier write to settle", async () => {
    const first = createDeferred<{
      readonly content: string;
      readonly generatedDefaultContent: string;
    }>();
    const second = createDeferred<{
      readonly content: string;
      readonly generatedDefaultContent: string;
    }>();
    guideMocks.setGlobalMutateAsync
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPanel();
    const editor = screen.getByTestId<HTMLTextAreaElement>(
      "agents-selection-guide-input",
    );

    fireEvent.change(editor, { target: { value: "first edit" } });
    fireEvent.blur(editor);

    expect(guideMocks.setGlobalMutateAsync).toHaveBeenCalledTimes(1);
    expect(guideMocks.setGlobalMutateAsync).toHaveBeenLastCalledWith({
      content: "first edit",
    });

    fireEvent.change(editor, { target: { value: "second edit" } });
    fireEvent.blur(editor);

    expect(guideMocks.setGlobalMutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({
        content: "first edit",
        generatedDefaultContent: "claude guide",
      });
      await first.promise;
    });

    await waitFor(() => {
      expect(guideMocks.setGlobalMutateAsync).toHaveBeenCalledTimes(2);
    });
    expect(guideMocks.setGlobalMutateAsync).toHaveBeenLastCalledWith({
      content: "second edit",
    });

    await act(async () => {
      second.resolve({
        content: "second edit",
        generatedDefaultContent: "claude guide",
      });
      await second.promise;
    });

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeTruthy();
    });
  });
});

function createDeferred<T>(): Deferred<T> {
  let resolveValue: (value: T) => void = () => {};
  let rejectValue: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  return { promise, resolve: resolveValue, reject: rejectValue };
}
