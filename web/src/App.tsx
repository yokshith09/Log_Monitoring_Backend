import { useEffect, useState } from "react";
import { Overview } from "@/pages/Overview";
import { Logs } from "@/pages/Logs";
import { Alerts, Cost, Performance, Resources } from "@/pages/Rest";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs" },
  { id: "performance", label: "Performance" },
  { id: "resources", label: "Resources" },
  { id: "cost", label: "Cost" },
  { id: "alerts", label: "Alerts" }
] as const;

const RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" }
];

export default function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || "overview");
  const [hours, setHours] = useState(6);

  useEffect(() => {
    const onHash = () => setPage(location.hash.slice(1) || "overview");
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-full">
      <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <a href="#overview" className="flex items-center gap-2.5 shrink-0">
            <span aria-hidden className="grid size-7 place-items-center rounded-[5px]" style={{ background: "var(--primary)" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 10.5 4.5 6l3 3L13 3" stroke="#0c1714" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[0.95rem] font-semibold tracking-tight">Vantage</span>
          </a>

          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={page === item.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[0.82rem] transition-colors",
                  page === item.id
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="border-border/60 flex items-center gap-0.5 rounded-md border p-0.5">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                onClick={() => setHours(range.hours)}
                aria-pressed={hours === range.hours}
                className={cn(
                  "rounded px-2.5 py-1 text-xs transition-colors",
                  hours === range.hours
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">
            {NAV.find((n) => n.id === page)?.label ?? "Overview"}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            GCP application log monitoring, resource usage and cost optimisation · StaySync production
          </p>
        </div>

        {page === "overview" && <Overview hours={hours} />}
        {page === "logs" && <Logs hours={hours} />}
        {page === "performance" && <Performance hours={hours} />}
        {page === "resources" && <Resources hours={hours} />}
        {page === "cost" && <Cost />}
        {page === "alerts" && <Alerts hours={hours} />}
      </main>
    </div>
  );
}
