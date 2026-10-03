import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Cpu,
  Gauge,
  LayoutGrid,
  Keyboard as KeyboardIcon,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings2,
  Sparkles
} from "lucide-react";
import { NAV, buildHash, type PageId } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICON: Record<PageId, typeof LayoutGrid> = {
  overview: LayoutGrid,
  incidents: AlertTriangle,
  insights: Sparkles,
  services: Layers,
  logs: ScrollText,
  performance: Gauge,
  resources: Cpu,
  cost: Banknote,
  connections: Settings2,
  alerts: AlertTriangle
};

/**
 * Left navigation.
 *
 * A horizontal tab strip stops scaling at about six items and gives every
 * destination the same weight. A rail reads top to bottom in one fixation,
 * leaves the full header width for the toolbar, and has room for the badge
 * counts that tell you where to go before you click.
 */
export function Sidebar({
  page,
  scope,
  counts,
  collapsed,
  onToggle
}: {
  page: PageId;
  scope: string;
  counts: { incidents: number; anomalies: number };
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "border-border/70 bg-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[216px]"
      )}
    >
      <div className={cn("flex h-[57px] shrink-0 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
        <a href={buildHash("overview")} className="flex min-w-0 items-center gap-2.5" title="Vantage">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-[5px]"
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
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[0.95rem] leading-tight font-semibold tracking-tight">
                Vantage
              </span>
              <span className="text-muted-foreground block truncate text-[0.66rem] leading-tight">
                Cloud log monitoring
              </span>
            </span>
          )}
        </a>
      </div>

      <nav aria-label="Sections" className="flex-1 overflow-y-auto px-2 py-1">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const Icon = ICON[item.id];
            const active = page === item.id;
            const badge =
              item.id === "incidents" ? counts.incidents : item.id === "insights" ? counts.anomalies : 0;

            return (
              <li key={item.id}>
                <a
                  href={buildHash(item.id, scope === "all" ? {} : { scope })}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? `${item.label} — ${item.hint}` : item.hint}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[0.82rem] transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full"
                      style={{ background: "var(--primary)" }}
                    />
                  )}
                  <Icon size={15} strokeWidth={2} aria-hidden className="shrink-0" />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  {badge > 0 && !collapsed && (
                    <span
                      className="tabular shrink-0 rounded-full px-1.5 text-[0.65rem] leading-[17px] font-semibold"
                      style={{
                        background: "color-mix(in oklab, var(--sev-error) 16%, transparent)",
                        color: "var(--sev-error)"
                      }}
                    >
                      {badge}
                    </span>
                  )}
                  {badge > 0 && collapsed && (
                    <span
                      aria-hidden
                      className="absolute top-1 right-1 size-1.5 rounded-full"
                      style={{ background: "var(--sev-error)" }}
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-border/60 flex shrink-0 items-center gap-1 border-t p-2">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        {!collapsed && <ShortcutHint />}
      </div>
    </aside>
  );
}

function ShortcutHint() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
      >
        <KeyboardIcon size={14} aria-hidden className="shrink-0" />
        <span className="truncate">Shortcuts</span>
        <kbd className="border-border/70 text-muted-foreground ml-auto shrink-0 rounded border px-1 font-mono text-[0.62rem]">
          ?
        </kbd>
      </button>
      {open && <ShortcutSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "g then o", does: "Overview" },
  { keys: "g then i", does: "Incidents" },
  { keys: "g then n", does: "Insights" },
  { keys: "g then s", does: "Services" },
  { keys: "g then l", does: "Logs" },
  { keys: "g then p", does: "Performance" },
  { keys: "g then r", does: "Resources" },
  { keys: "g then c", does: "Cost" },
  { keys: "1 … 6", does: "Time window, 1m through 24h" },
  { keys: "r", does: "Refresh now" },
  { keys: "/", does: "Focus search (Logs)" },
  { keys: "t", does: "Toggle light / dark" },
  { keys: "[", does: "Collapse or expand the sidebar" },
  { keys: "?", does: "This list" }
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="bg-popover border-border/70 w-full max-w-md rounded-lg border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border/60 flex items-center justify-between border-b px-5 py-3">
          <p className="text-sm font-semibold">Keyboard shortcuts</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Close
          </button>
        </div>
        <ul className="divide-border/40 divide-y px-5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-6 py-2">
              <span className="text-sm">{s.does}</span>
              <kbd className="border-border/70 bg-secondary/60 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.7rem]">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Global keyboard layer.
 *
 * `g` opens a prefix that expires after 1.2s, which is the Gmail/Linear idiom
 * and avoids stealing single letters that a reader might type into a field.
 * Every handler bails when focus is inside an input, so typing a query never
 * navigates the page out from under you.
 */
export function useShortcuts({
  onGo,
  onWindow,
  onRefresh,
  onTheme,
  onSidebar,
  onHelp
}: {
  onGo: (page: PageId) => void;
  onWindow: (index: number) => void;
  onRefresh: () => void;
  onTheme: () => void;
  onSidebar: () => void;
  onHelp: () => void;
}) {
  useEffect(() => {
    let prefix = false;
    let timer: ReturnType<typeof setTimeout>;

    const GO: Record<string, PageId> = {
      o: "overview",
      i: "incidents",
      n: "insights",
      s: "services",
      l: "logs",
      p: "performance",
      r: "resources",
      c: "cost"
    };

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute("role") === "combobox");
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (typing) {
        // Escape gives the keyboard back without reaching for the mouse.
        if (e.key === "Escape") el.blur();
        return;
      }

      if (prefix) {
        const target = GO[e.key.toLowerCase()];
        prefix = false;
        clearTimeout(timer);
        if (target) {
          e.preventDefault();
          onGo(target);
        }
        return;
      }

      if (e.key === "g") {
        prefix = true;
        timer = setTimeout(() => (prefix = false), 1200);
        return;
      }

      if (e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        onWindow(Number(e.key) - 1);
        return;
      }

      switch (e.key) {
        case "r":
          e.preventDefault();
          onRefresh();
          break;
        case "t":
          onTheme();
          break;
        case "[":
          onSidebar();
          break;
        case "?":
          e.preventDefault();
          onHelp();
          break;
        case "/": {
          const search = document.querySelector<HTMLInputElement>("[data-search]");
          if (search) {
            e.preventDefault();
            search.focus();
            search.select();
          }
          break;
        }
      }
    };

    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [onGo, onWindow, onRefresh, onTheme, onSidebar, onHelp]);
}
