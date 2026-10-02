import { useState } from "react";
import { Overview } from "@/pages/Overview";
import { Services } from "@/pages/Services";
import { Logs } from "@/pages/Logs";
import { Alerts } from "@/pages/Alerts";
import { Connections } from "@/pages/Connections";
import { Performance, Resources } from "@/pages/Rest";
import { ScopePicker } from "@/components/scope";
import { DEFAULT_WINDOW, NAV, NAV_GROUPS, WINDOWS, buildHash, useRoute } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default function App() {
  const { page, params } = useRoute();
  const { theme, toggle } = useTheme();
  const [windowId, setWindowId] = useState(DEFAULT_WINDOW.id);
  const [live, setLive] = useState(true);
  const activeWindow = WINDOWS.find((w) => w.id === windowId) ?? DEFAULT_WINDOW;
  // Polling cadence follows the window: a 1-minute view refreshes every 5s,
  // a 24-hour view every 2 minutes. 0 disables it.
  const refreshMs = live ? activeWindow.refreshMs : 0;

  // Scope lives in the URL so a drill-down keeps the account it came from.
  const scope = params.scope ?? "all";
  const setScope = (next: string) => {
    location.hash = buildHash(page, { ...params, scope: next });
  };

  const current = NAV.find((n) => n.id === page) ?? NAV[0];

  return (
    <div className="min-h-full">
      <header className="border-border/70 bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
          <a href={buildHash("overview")} className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[5px]"
              style={{ background: "var(--primary)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M1 10.5 4.5 6l3 3L13 3"
                  stroke="var(--primary-foreground)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>
              <span className="block text-[0.95rem] leading-tight font-semibold tracking-tight">Vantage</span>
              <span className="text-muted-foreground block text-[0.68rem] leading-tight">
                Cloud log monitoring
              </span>
            </span>
          </a>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ScopePicker scope={scope} onScope={setScope} />

            <div className="border-border/70 flex items-center gap-0.5 rounded-md border p-0.5">
              {WINDOWS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWindowId(w.id)}
                  aria-pressed={windowId === w.id}
                  title={w.title}
                  className={cn(
                    "rounded px-2 py-1 text-xs transition-colors",
                    windowId === w.id
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
              title={live ? `Refreshing every ${activeWindow.refreshMs / 1000}s` : "Auto-refresh paused"}
              className={cn(
                "border-border/70 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                live ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", live && "animate-pulse")}
                style={{ background: live ? "var(--status-good)" : "var(--muted-foreground)" }}
              />
              {live ? `Live · ${activeWindow.refreshMs / 1000}s` : "Paused"}
            </button>

            <button
              onClick={toggle}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="border-border/70 text-muted-foreground hover:text-foreground grid size-[34px] place-items-center rounded-md border transition-colors"
            >
              {theme === "dark" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Nav grouped by the question each page answers. */}
        <nav className="border-border/50 border-t" aria-label="Sections">
          <div className="mx-auto flex max-w-[1500px] items-stretch gap-5 overflow-x-auto px-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.group} className="flex items-center gap-0.5">
                {/* A one-item group would just repeat its own item's label. */}
                {group.items.length > 1 && (
                  <span className="text-muted-foreground/70 mr-1 shrink-0 text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
                    {group.group}
                  </span>
                )}
                {group.items.map((item) => (
                  <a
                    key={item.id}
                    href={buildHash(item.id, scope === "all" ? {} : { scope })}
                    aria-current={page === item.id ? "page" : undefined}
                    title={item.hint}
                    className={cn(
                      "relative shrink-0 px-2.5 py-2.5 text-[0.82rem] whitespace-nowrap transition-colors",
                      page === item.id
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                    {page === item.id && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full"
                        style={{ background: "var(--primary)" }}
                      />
                    )}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight">{current.label}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{current.hint}</p>
        </div>

        {/* No remount on refresh: the hook swaps data in place, so charts keep
            their state instead of being torn down every poll. */}
        {page === "overview" && <Overview window={activeWindow.query} scope={scope} refreshMs={refreshMs} />}
        {page === "services" && <Services window={activeWindow.query} scope={scope} refreshMs={refreshMs} />}
        {page === "logs" && <Logs window={activeWindow.query} params={params} refreshMs={refreshMs} />}
        {page === "performance" && <Performance window={activeWindow.query} scope={scope} refreshMs={refreshMs} />}
        {page === "resources" && <Resources window={activeWindow.query} scope={scope} refreshMs={refreshMs} />}
        {page === "alerts" && <Alerts window={activeWindow.query} scope={scope} refreshMs={refreshMs} />}
        {page === "connections" && <Connections />}
      </main>
    </div>
  );
}
