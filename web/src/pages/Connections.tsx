import { Explain, Figure, Section } from "@/components/layout";
import { Panel } from "@/components/primitives";
import { ProviderMark, type Connection, type Provider } from "@/components/scope";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";

/**
 * Connected accounts, and the catalogue of providers that can be added.
 *
 * This page is the multi-cloud story made visible: one platform, several
 * providers, several accounts per provider, and a documented path for the next
 * provider.
 */
export function Connections() {
  const { data, loading } = useApi<{ connections: Connection[]; providers: Provider[] }>("/api/connections", []);
  if (loading || !data) return <PageSkeleton />;

  const { connections, providers } = data;
  const byProvider = providers
    .map((p) => ({ provider: p, items: connections.filter((c) => c.provider === p.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-10">
      <Section
        eyebrow="Connected"
        title="Your cloud accounts"
        description="Each connection is one account on one provider. Telemetry from every connection is normalized into a single format, so a view can span all of them or narrow to one."
      >
        <div className="space-y-6">
          {byProvider.map(({ provider, items }) => (
            <div key={provider.id}>
              <div className="mb-2.5 flex items-center gap-2">
                <ProviderMark provider={provider.id} />
                <h3 className="text-sm font-semibold">{provider.name}</h3>
                <span className="text-muted-foreground text-xs">
                  {items.length} {items.length === 1 ? provider.accountLabel.toLowerCase() : `${provider.accountLabel.toLowerCase()}s`}
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((connection) => (
                  <Panel key={connection.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{connection.name}</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                          {connection.accountLabel}: {connection.account}
                        </p>
                      </div>
                      <span
                        className="flex shrink-0 items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase"
                        style={{
                          color: "var(--status-good)",
                          background: "color-mix(in oklab, var(--status-good) 12%, transparent)"
                        }}
                      >
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--status-good)" }} />
                        {connection.status}
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Region</dt>
                        <dd className="mt-0.5 font-mono">{connection.region}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Environment</dt>
                        <dd className="mt-0.5 font-mono">{connection.environment}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Connected</dt>
                        <dd className="mt-0.5">{new Date(connection.connectedAt).toLocaleDateString()}</dd>
                      </div>
                    </dl>

                    <div className="border-border/60 mt-3 border-t pt-3">
                      <p className="text-muted-foreground mb-1.5 text-xs">Monitored services</p>
                      <div className="flex flex-wrap gap-1.5">
                        {connection.services.map((service) => (
                          <span
                            key={service}
                            className="border-border/60 bg-secondary/50 rounded px-1.5 py-0.5 text-[0.68rem]"
                          >
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Panel>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Catalogue"
        title="Supported providers"
        description="What each provider contributes, and what connecting one requires. Adding a provider is a registry entry describing its severity vocabulary and field names — the rest of the platform is unchanged."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {providers.map((provider) => {
            const planned = provider.status !== "available";
            return (
              <Panel key={provider.id} className={planned ? "opacity-70" : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ProviderMark provider={provider.id} />
                    <p className="text-sm font-semibold">{provider.name}</p>
                  </div>
                  <span
                    className="border-border/70 text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem] tracking-wide uppercase"
                  >
                    {planned ? "Planned" : "Available"}
                  </span>
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  {Object.entries(provider.services).map(([capability, service]) => (
                    <div key={capability} className="flex gap-2">
                      <dt className="text-muted-foreground w-28 shrink-0 capitalize">{capability}</dt>
                      <dd className="min-w-0">{service}</dd>
                    </div>
                  ))}
                </dl>

                <div className="border-border/60 mt-3 border-t pt-3">
                  <p className="text-muted-foreground mb-1 text-xs">Query language</p>
                  <p className="font-mono text-xs">{provider.queryLanguage}</p>
                  <pre className="bg-secondary/50 border-border/60 mt-2 overflow-x-auto rounded border p-2 font-mono text-[0.65rem] leading-relaxed">
                    {provider.exampleQuery}
                  </pre>
                </div>

                <div className="border-border/60 mt-3 border-t pt-3">
                  <p className="text-muted-foreground mb-1.5 text-xs">Required access</p>
                  <ul className="space-y-0.5">
                    {provider.requiredRoles.map((role) => (
                      <li key={role} className="text-muted-foreground font-mono text-[0.65rem]">
                        {role}
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            );
          })}
        </div>

        <div className="mt-4">
          <Explain>
            Credentials are referenced from a secret manager, never stored in the platform and never sent to the
            browser. Each connection needs read-only access to its provider&rsquo;s logging, metrics and billing APIs.
          </Explain>
        </div>
      </Section>
    </div>
  );
}

export { Figure };
