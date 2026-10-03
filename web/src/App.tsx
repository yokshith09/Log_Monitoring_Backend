import { useCallback, useEffect, useState } from "react";
import { Overview } from "@/pages/Overview";
import { Services } from "@/pages/Services";
import { Logs } from "@/pages/Logs";
import { Incidents } from "@/pages/Incidents";
import { Insights } from "@/pages/Insights";
import { Connections } from "@/pages/Connections";
import { Cost, Performance, Resources } from "@/pages/Rest";
import { ScopePicker } from "@/components/scope";
import { NotificationCentre } from "@/components/notifications";
import { Sidebar, ShortcutSheet, useShortcuts } from "@/components/shell";
import { LiveToggle, RefreshButton, ThemeToggle, WindowPicker } from "@/components/toolbar";
import { useApi } from "@/lib/api";
import type { NotificationsResponse } from "@/lib/contracts";
import { DEFAULT_WINDOW, NAV, WINDOWS, buildHash, useRoute, type PageId } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "vantage-sidebar-collapsed";

export default function App() {
  const { page, params } = useRoute();
  const { theme, toggle } = useTheme();
  const [windowId, setWindowId] = useState(DEFAULT_WINDOW.id);
  const [live, setLive] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [help, setHelp] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const activeWindow = WINDOWS.find((w) => w.id === windowId) ?? DEFAULT_WINDOW;
  const refreshMs = live ? activeWindow.refreshMs : 0;

  const scope = params.scope ?? "all";
  const setScope = (next: string) => {
    location.hash = buildHash(page, { ...params, scope: next });
  };

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* blocked storage — the preference just does not persist */
      }
      return !c;
    });
  }, []);

  const { data: notifications, refreshing } = useApi<NotificationsResponse>(
    `/api/notifications?${activeWindow.query}&scope=${scope}&n=${nonce}`,
    [activeWindow.query, scope, nonce],
    live ? Math.max(15_000, activeWindow.refreshMs) : 0
  );

  useShortcuts({
    onGo: useCallback(
      (target: PageId) => {
        location.hash = buildHash(target, scope === "all" ? {} : { scope });
      },
      [scope]
    ),
    onWindow: useCallback((i: number) => WINDOWS[i] && setWindowId(WINDOWS[i].id), []),
    onRefresh: refresh,
    onTheme: toggle,
    onSidebar: toggleSidebar,
    onHelp: useCallback(() => setHelp(true), [])
  });

  // The rail is an overlay below `lg`, so the main column must not reserve room
  // for it there or every page loses a sixth of its width on a laptop.
  useEffect(() => {
    document.documentElement.style.setProperty("--rail", collapsed ? "60px" : "216px");
  }, [collapsed]);

  const current = NAV.find((n) => n.id === page) ?? NAV[0];
  const pageProps = { window: `${activeWindow.query}&n=${nonce}`, scope, refreshMs };
  const open = notifications?.notifications ?? [];

  return (
    <div className="min-h-full">
      <Sidebar
        page={page}
        scope={scope}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        counts={{
          incidents: open.filter((n) => n.kind === "incident").length,
          anomalies: open.filter((n) => n.kind === "anomaly").length
        }}
      />

      <div className="pl-[60px] lg:pl-[var(--rail)]">
        <header className="border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
          <div className="flex h-[57px] flex-wrap items-center gap-x-3 gap-y-2 px-5">
            <div className="min-w-0">
              <h1 className="truncate text-[0.95rem] leading-tight font-semibold tracking-tight">
                {current.label}
              </h1>
              <p className="text-muted-foreground truncate text-[0.68rem] leading-tight">{current.hint}</p>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ScopePicker scope={scope} onScope={setScope} />
              <WindowPicker value={windowId} onChange={setWindowId} />
              <LiveToggle live={live} seconds={activeWindow.refreshMs / 1000} onToggle={() => setLive((v) => !v)} />
              <RefreshButton onRefresh={refresh} busy={refreshing} />
              <NotificationCentre notifications={open} />
              <ThemeToggle theme={theme} onToggle={toggle} />
            </div>
          </div>
        </header>

        <main className={cn("px-5 py-6", "mx-auto max-w-[1500px]")}>
          {page === "overview" && <Overview {...pageProps} />}
          {page === "incidents" && <Incidents {...pageProps} />}
          {page === "insights" && <Insights {...pageProps} />}
          {page === "services" && <Services {...pageProps} />}
          {page === "logs" && <Logs window={pageProps.window} params={params} refreshMs={refreshMs} />}
          {page === "performance" && <Performance {...pageProps} />}
          {page === "resources" && <Resources {...pageProps} />}
          {page === "cost" && <Cost {...pageProps} />}
          {page === "connections" && <Connections />}
        </main>
      </div>

      {help && <ShortcutSheet onClose={() => setHelp(false)} />}
    </div>
  );
}
