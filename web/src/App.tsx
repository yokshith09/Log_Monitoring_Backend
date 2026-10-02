import { useEffect, useState } from "react";
import { Overview } from "@/pages/Overview";
import { Services } from "@/pages/Services";
import { Logs } from "@/pages/Logs";
import { Alerts } from "@/pages/Alerts";
import { Recommendations } from "@/pages/Recommendations";
import { Cost, Performance, Resources } from "@/pages/Rest";
import { NAV, RANGES, buildHash, useRoute } from "@/lib/nav";
import { cn } from "@/lib/utils";

export default function App() {
  const { page, params } = useRoute();
  const [hours, setHours] = useState(6);
  const [live, setLive] = useState(false);
  const [tick, setTick] = useState(0);

  // §10.1 asks for near-real-time operational views. Polling stands in for a
  // stream; the refresh interval is deliberately visible rather than hidden.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [live]);

  const current = NAV.find((n) => n.id === page) ?? NAV[0];

  return (
    <div className="min-h-full">
      <header className="border-border/60 bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-6 py-3">
          <a href={buildHash("overview")} className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[5px]"
              style={{ background: "var(--primary)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 10.5 4.5 6l3 3L13 3"
                  stroke="#0c1714"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[0.95rem] font-semibold tracking-tight">Vantage</span>
          </a>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
              className={cn(
                "border-border/60 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                live ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
              )}
              title="Refresh every 15 seconds"
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", live && "animate-pulse")}
                style={{ background: live ? "var(--status-good)" : "var(--muted-foreground)" }}
              />
              {live ? "Live" : "Paused"}
            </button>

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
        </div>

        <nav className="border-border/40 border-t">
          <div className="mx-auto flex max-w-[1500px] gap-0.5 overflow-x-auto px-5">
            {NAV.map((item) => (
              <a
                key={item.id}
                href={buildHash(item.id)}
                aria-current={page === item.id ? "page" : undefined}
                className={cn(
                  "relative shrink-0 px-3 py-2.5 text-[0.82rem] whitespace-nowrap transition-colors",
                  page === item.id ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                {page === item.id && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                    style={{ background: "var(--primary)" }}
                  />
                )}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{current.label}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{current.hint}</p>
          </div>
          <p className="text-muted-foreground text-xs">
            GCP log monitoring, resource usage &amp; cost optimisation &middot; StaySync production
          </p>
        </div>

        <div key={tick}>
          {page === "overview" && <Overview hours={hours} />}
          {page === "services" && <Services hours={hours} />}
          {page === "logs" && <Logs hours={hours} params={params} />}
          {page === "performance" && <Performance hours={hours} />}
          {page === "resources" && <Resources hours={hours} />}
          {page === "cost" && <Cost />}
          {page === "recommendations" && <Recommendations />}
          {page === "alerts" && <Alerts hours={hours} />}
        </div>
      </main>
    </div>
  );
}
