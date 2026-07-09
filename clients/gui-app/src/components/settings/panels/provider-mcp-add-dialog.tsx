import { useMemo, useState, type ReactNode } from "react";
import type {
  ProviderMcpAuthType,
  ProviderMcpCapabilities,
  ProviderMcpServerTransport,
  ProviderMcpTransport,
  ProviderNativeScope,
} from "@traycer/protocol/host/provider-native-schemas";
import type { ProviderId } from "@traycer/protocol/host/provider-schemas";
import { MutedAgentSpinner } from "@/components/ui/agent-spinning-dots";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProvidersMcpMutate } from "@/hooks/providers/use-providers-mcp-mutate-mutation";
import { cn } from "@/lib/utils";

type TransportKind = "remote" | "local";

export function ProviderMcpAddDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly providerLabel: string;
  readonly capabilities: ProviderMcpCapabilities;
  readonly existingNames: readonly string[];
  readonly scopeTuple: {
    readonly providerId: ProviderId;
    readonly scope: ProviderNativeScope;
    readonly workspaceRoot: string | null;
  };
}): ReactNode {
  const {
    open,
    onOpenChange,
    providerLabel,
    capabilities,
    existingNames,
    scopeTuple,
  } = props;

  const remoteTransports = useMemo(
    () =>
      capabilities.transports.filter(
        (t): t is "http" | "sse" => t === "http" || t === "sse",
      ),
    [capabilities.transports],
  );
  const supportsLocal = capabilities.transports.includes("stdio");
  const supportsRemote = remoteTransports.length > 0;
  const multiTransport = supportsLocal && supportsRemote;

  const [kind, setKind] = useState<TransportKind>(
    supportsRemote ? "remote" : "local",
  );
  const lockedKind: TransportKind = supportsRemote ? "remote" : "local";
  const effectiveKind: TransportKind = multiTransport ? kind : lockedKind;

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [authType, setAuthType] = useState<ProviderMcpAuthType>(
    capabilities.authTypes[0] ?? "none",
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutate = useProvidersMcpMutate();

  const authOptions = useMemo(() => {
    if (effectiveKind === "local") return [] as ProviderMcpAuthType[];
    return capabilities.authTypes;
  }, [capabilities.authTypes, effectiveKind]);

  const reset = () => {
    setName("");
    setUrl("");
    setCommand("");
    setArgsText("");
    setEnvText("");
    setHeadersText("");
    setAuthType(capabilities.authTypes[0] ?? "none");
    setFormError(null);
    setKind(supportsRemote ? "remote" : "local");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const validate = (): ProviderMcpServerTransport | null => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setFormError("Name is required.");
      return null;
    }
    if (existingNames.includes(trimmedName)) {
      setFormError(
        `A server named “${trimmedName}” already exists in this scope.`,
      );
      return null;
    }

    if (effectiveKind === "remote") {
      const trimmedUrl = url.trim();
      if (trimmedUrl.length === 0) {
        setFormError("Server URL is required.");
        return null;
      }
      if (!isHttpUrl(trimmedUrl)) {
        setFormError("Enter a valid http(s) URL.");
        return null;
      }
      const headers =
        authType === "headers" || authType === "oauth"
          ? parseKeyValueLines(headersText)
          : null;
      if (headers === "invalid") {
        setFormError("Headers must be KEY=value lines.");
        return null;
      }
      const remoteType: ProviderMcpTransport = remoteTransports.includes("http")
        ? "http"
        : "sse";
      if (remoteType === "http") {
        return { type: "http", url: trimmedUrl, headers };
      }
      return { type: "sse", url: trimmedUrl, headers };
    }

    const trimmedCommand = command.trim();
    if (trimmedCommand.length === 0) {
      setFormError("Command is required.");
      return null;
    }
    const args = splitArgs(argsText);
    const env = parseKeyValueLines(envText);
    if (env === "invalid") {
      setFormError("Env vars must be KEY=value lines.");
      return null;
    }
    return {
      type: "stdio",
      command: trimmedCommand,
      args,
      env,
    };
  };

  const handleSubmit = () => {
    const transport = validate();
    if (transport === null) return;
    setFormError(null);
    mutate.mutate(
      {
        ...scopeTuple,
        mutation: {
          action: "add",
          name: name.trim(),
          transport,
        },
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(92vw,28rem)] gap-0 overflow-hidden p-0 sm:max-w-md"
        data-testid="provider-mcp-add-dialog"
      >
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Add MCP server — {providerLabel}</DialogTitle>
          <DialogDescription>
            Config is written to this provider&apos;s{" "}
            {scopeTuple.scope === "global" ? "global" : "project"} scope.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 pb-2">
          {multiTransport ? (
            <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
              <KindChip
                label="Remote"
                active={effectiveKind === "remote"}
                onClick={() => {
                  setKind("remote");
                }}
              />
              <KindChip
                label="Local (stdio)"
                active={effectiveKind === "local"}
                onClick={() => {
                  setKind("local");
                }}
              />
            </div>
          ) : null}

          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="context7"
            multiline={false}
          />

          {effectiveKind === "remote" ? (
            <>
              <Field
                label="Server URL"
                value={url}
                onChange={setUrl}
                placeholder="https://mcp.example.com"
                multiline={false}
              />
              {authOptions.length > 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Authentication</Label>
                  <div className="flex flex-wrap gap-1">
                    {authOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setAuthType(option);
                        }}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-ui-xs transition-colors",
                          authType === option
                            ? "border-border bg-muted text-foreground"
                            : "border-border/60 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {authTypeLabel(option)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {authType === "headers" ||
              (authType === "oauth" && authOptions.includes("headers")) ? (
                <Field
                  label="Custom headers"
                  value={headersText}
                  onChange={setHeadersText}
                  placeholder={"Authorization=Bearer …\nX-Api-Key=…"}
                  multiline
                />
              ) : null}
            </>
          ) : (
            <>
              <Field
                label="Command"
                value={command}
                onChange={setCommand}
                placeholder="npx"
                multiline={false}
              />
              <Field
                label="Args"
                value={argsText}
                onChange={setArgsText}
                placeholder="-y @modelcontextprotocol/server-github"
                multiline={false}
              />
              <Field
                label="Env vars"
                value={envText}
                onChange={setEnvText}
                placeholder={"GITHUB_TOKEN=…\nFOO=bar"}
                multiline
              />
            </>
          )}

          {formError !== null ? (
            <p className="text-ui-xs text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutate.isPending}
            onClick={() => {
              handleOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={mutate.isPending}
            onClick={handleSubmit}
          >
            {mutate.isPending ? <MutedAgentSpinner /> : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindChip(props: {
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

function Field(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly multiline: boolean;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{props.label}</Label>
      {props.multiline ? (
        <textarea
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          placeholder={props.placeholder}
          rows={3}
          className="min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-ui-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      ) : (
        <Input
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
          }}
          placeholder={props.placeholder}
        />
      )}
    </div>
  );
}

function authTypeLabel(type: ProviderMcpAuthType): string {
  switch (type) {
    case "none":
      return "None";
    case "headers":
      return "API key";
    case "oauth":
      return "OAuth";
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function splitArgs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

function parseKeyValueLines(
  text: string,
): Record<string, string> | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const result: Record<string, string> = {};
  for (const line of trimmed.split("\n")) {
    const row = line.trim();
    if (row.length === 0) continue;
    const eq = row.indexOf("=");
    if (eq <= 0) return "invalid";
    const key = row.slice(0, eq).trim();
    const value = row.slice(eq + 1).trim();
    if (key.length === 0) return "invalid";
    result[key] = value;
  }
  return Object.keys(result).length === 0 ? null : result;
}
