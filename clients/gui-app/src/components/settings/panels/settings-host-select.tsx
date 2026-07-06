import type { ReactNode } from "react";
import type { HostDirectoryEntry } from "@traycer-clients/shared/host-client/host-directory";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { settingsHostOptionLabel } from "./settings-host-labels";

export function SettingsHostSelect(props: {
  readonly hosts: readonly HostDirectoryEntry[];
  readonly value: string | null;
  readonly onChange: (hostId: string) => void;
  readonly ariaLabel: string;
}): ReactNode {
  return (
    <Select value={props.value ?? undefined} onValueChange={props.onChange}>
      <SelectTrigger
        size="sm"
        aria-label={props.ariaLabel}
        className="w-[min(60vw,15rem)]"
      >
        <SelectValue placeholder="Select a host" />
      </SelectTrigger>
      <SelectContent>
        {props.hosts.map((host) => (
          <SelectItem key={host.hostId} value={host.hostId}>
            {settingsHostOptionLabel(host)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
