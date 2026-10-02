import { Explain, Figure, Section } from "@/components/layout";
import { Panel } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import type { Connection } from "@/lib/contracts";

interface Provider {
  id: string;
  name: string;
  shortName: string;
  accountLabel: string;
  status: string;
  capabilities: Record<string, boolean>;
  services: Record<string, string>;
  requiredRoles: string[];
  queryLanguage: string;
  exampleQuery: string;
}

/**
 * Setup — what this dashboard is reading from.
 *
 * One connected Google Cloud project. The page answers three questions in
 * order: which project, which of its services we read, and what access that
 * needs. Nothing here is configurable yet; it is a statement of the current
 * wiring rather than a form.
 */
export function Connections() {
  const { data, loading } = useApi<{ connections: Connection[]; providers: Provider[] }>(
    "/api/connections",
    []
  );
  if (loading || !data) return <PageSkeleton />;

  const connection = data.connections[0];
  const provider = data.providers.find((p) => p.id === connection?.provider);
  if (!connection || !provider) return <PageSkeleton />;

  const CAPABILITY_COPY: Record<string, string> = {
    logs: "Every request and background job this project writes, as structured entries.",
    metrics: "Infrastructure counters — CPU, memory, instance count, database connections.",
    cost: "Daily spend per service, used by the cost views when enabled.",
    recommendations: "The provider's own optimisation suggestions."
  };

  return (
    <div className="space-y-10">
      <Section
        eyebrow="Project"
        title={connection.name}
        description="The Google Cloud project this dashboard reads from. All telemetry on every other page comes from here."
      >
        <Panel>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Project ID" value={connection.account} help="The GCP project identifier" />
            <Figure label="Region" value={connection.region} help="Where the workloads run" />
            <Figure label="Environment" value={connection.environment} help="How this project is treated" />
            <Figure
              label="Status"
              value="Connected"
              help={`Since ${new Date(connection.connectedAt).toLocaleDateString()}`}
              tone="var(--status-good)"
            />
          </div>
        </Panel>
      </Section>

      <Section
        eyebrow="Monitored services"
        title="What is being watched"
        description="The Google Cloud services inside this project that produce the signals on this dashboard."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connection.services.map((service) => (
            <Panel key={service}>
              <p className="text-sm font-medium">{service}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {service === "Cloud Run"
                  ? "Runs the application containers. Source of request logs, CPU, memory and instance counts."
                  : service === "Cloud SQL"
                    ? "The managed PostgreSQL database. Source of connection counts and query latency."
                    : service === "Pub/Sub"
                      ? "The message queue carrying order confirmation events to the worker."
                      : service === "Cloud Logging"
                        ? "Collects every structured log line the application writes to stdout."
                        : "Collects infrastructure metrics for the workloads above."}
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Data sources"
        title="Where each signal comes from"
        description="Which Google Cloud API backs each part of the dashboard."
      >
        <Panel>
          <dl className="divide-border/60 divide-y">
            {Object.entries(provider.services).map(([capability, service]) => (
              <div key={capability} className="flex flex-wrap items-start gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
                <dt className="w-32 shrink-0">
                  <span className="text-sm font-medium capitalize">{capability}</span>
                </dt>
                <dd className="min-w-0 flex-1">
                  <p className="font-mono text-sm">{service}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{CAPABILITY_COPY[capability]}</p>
                </dd>
                <dd
                  className="shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase"
                  style={{
                    color: provider.capabilities[capability] ? "var(--status-good)" : "var(--muted-foreground)",
                    background: provider.capabilities[capability]
                      ? "color-mix(in oklab, var(--status-good) 12%, transparent)"
                      : "transparent"
                  }}
                >
                  {provider.capabilities[capability] ? "Available" : "Not used"}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </Section>

      <Section
        eyebrow="Access"
        title="What permission this needs"
        description="Read-only throughout. The dashboard never writes to your project and never changes a resource."
      >
        <Panel>
          <ul className="space-y-2">
            {provider.requiredRoles.map((role) => (
              <li key={role} className="flex items-center gap-3">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: "var(--status-good)" }} />
                <code className="font-mono text-sm">{role}</code>
              </li>
            ))}
          </ul>

          <div className="border-border/60 mt-4 border-t pt-4">
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">
              How logs are queried ({provider.queryLanguage})
            </p>
            <pre className="bg-secondary/50 border-border/60 overflow-x-auto rounded border p-3 font-mono text-xs leading-relaxed">
              {provider.exampleQuery}
            </pre>
          </div>

          <div className="mt-4">
            <Explain>
              Credentials are held in a secret manager and referenced by name. They are never stored in this
              platform, never written to a log, and never sent to the browser.
            </Explain>
          </div>
        </Panel>
      </Section>
    </div>
  );
}
