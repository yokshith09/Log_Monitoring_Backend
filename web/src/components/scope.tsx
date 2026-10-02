import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/api";

export interface Connection {
  id: string;
  provider: string;
  name: string;
  account: string;
  accountLabel: string;
  region: string;
  environment: string;
  status: string;
  services: string[];
  connectedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  shortName: string;
  accountLabel: string;
  accountHint: string;
  status: string;
  capabilities: Record<string, boolean>;
  services: Record<string, string>;
  credentials: { key: string; label: string; required: boolean; secret?: boolean }[];
  requiredRoles: string[];
  queryLanguage: string;
  exampleQuery: string;
}

/** Provider marks. Deliberately monochrome so they never read as series colours. */
export function ProviderMark({ provider, className }: { provider: string; className?: string }) {
  const letter = provider === "gcp" ? "G" : provider === "azure" ? "A" : provider === "aws" ? "W" : "?";
  return (
    <span
      aria-hidden
      className={`border-border/70 bg-secondary text-muted-foreground grid size-5 shrink-0 place-items-center rounded border text-[0.6rem] font-bold ${className ?? ""}`}
      title={provider}
    >
      {letter}
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: string }) {
  const label = provider === "gcp" ? "GCP" : provider === "azure" ? "Azure" : provider === "aws" ? "AWS" : provider;
  return (
    <span className="border-border/70 text-muted-foreground rounded border px-1.5 py-0.5 text-[0.65rem] font-medium">
      {label}
    </span>
  );
}

/**
 * Scope selector: all connections, everything on one provider, or one account.
 * Grouped so the two levels of scoping are visibly different choices.
 */
export function ScopePicker({ scope, onScope }: { scope: string; onScope: (v: string) => void }) {
  const { data } = useApi<{ connections: Connection[]; providers: Provider[] }>("/api/connections", []);
  if (!data) return null;

  const activeProviders = data.providers.filter((p) =>
    data.connections.some((c) => c.provider === p.id)
  );

  return (
    <Select value={scope} onValueChange={(v) => onScope(v ?? "all")}>
      <SelectTrigger className="bg-card border-border/70 h-9 w-[230px]" aria-label="Connection scope">
        <SelectValue placeholder="All connections" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">All connections</SelectItem>
        </SelectGroup>

        <SelectGroup>
          <SelectLabel>By provider</SelectLabel>
          {activeProviders.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {provider.name}
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectGroup>
          <SelectLabel>By account</SelectLabel>
          {data.connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              {connection.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
