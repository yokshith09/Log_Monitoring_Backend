import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Moon, Pause, Play, RefreshCw, Sun } from "lucide-react";
import { WINDOWS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Refresh as a labelled button, not a bare icon.
 *
 * An unlabelled circular-arrow next to a "Live" pill reads as a second state
 * toggle rather than an action. It also has to confirm it did something: the
 * data often comes back identical, so without feedback the click looks ignored.
 * Spinning → "Refreshed" → back to rest.
 */
export function RefreshButton({ onRefresh, busy }: { onRefresh: () => void; busy: boolean }) {
  const [state, setState] = useState<"rest" | "working" | "done">("rest");
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setState("working");
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setState("done");
    const timer = setTimeout(() => setState("rest"), 1400);
    return () => clearTimeout(timer);
  }, [busy]);

  // A refetch can finish in 200ms, which is too fast to read. Hold the working
  // state briefly so the button always visibly acknowledges the click.
  const click = () => {
    setState("working");
    wasBusy.current = true;
    onRefresh();
    setTimeout(() => setState((s) => (s === "working" ? "done" : s)), 450);
  };

  return (
    <button
      onClick={click}
      disabled={state === "working"}
      title="Refresh now (r)"
      className={cn(
        "border-border flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-wait",
        state === "done"
          ? "text-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      style={state === "done" ? { borderColor: "color-mix(in oklab, var(--status-good) 45%, transparent)" } : undefined}
    >
      {state === "done" ? (
        <Check size={14} aria-hidden style={{ color: "var(--status-good)" }} />
      ) : (
        <RefreshCw size={14} aria-hidden className={cn(state === "working" && "animate-spin")} />
      )}
      {state === "done" ? "Refreshed" : state === "working" ? "Refreshing" : "Refresh"}
    </button>
  );
}

/**
 * Time window as one dropdown rather than six segments.
 *
 * Six buttons in a row is already the full width the header can spare, and it
 * cannot grow to hold a custom range. The trigger states the current window,
 * which a segmented control only conveys by highlight.
 */
export function WindowPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = WINDOWS.find((w) => w.id === value) ?? WINDOWS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={root}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={active.title}
        className={cn(
          "border-border flex h-[34px] items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
          open ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary"
        )}
      >
        <span className="text-muted-foreground">Last</span>
        <span className="font-medium">{active.long}</span>
        <ChevronDown size={13} aria-hidden className="text-muted-foreground" />
      </button>

      {open && (
        <div className="bg-popover border-border absolute top-[calc(100%+4px)] right-0 z-50 w-56 rounded-lg border p-1 shadow-xl">
          {WINDOWS.map((w, i) => (
            <button
              key={w.id}
              onClick={() => {
                onChange(w.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-xs transition-colors",
                w.id === value ? "bg-secondary text-foreground font-medium" : "hover:bg-secondary/70"
              )}
            >
              <span className="w-3 shrink-0">
                {w.id === value && <Check size={12} aria-hidden style={{ color: "var(--status-good)" }} />}
              </span>
              <span className="flex-1">Last {w.long}</span>
              <span className="text-muted-foreground tabular shrink-0" title="Auto-refresh interval">
                {w.refreshMs / 1000}s
              </span>
              <kbd className="border-border text-muted-foreground shrink-0 rounded border px-1 font-mono text-[0.6rem]">
                {i + 1}
              </kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LiveToggle({ live, seconds, onToggle }: { live: boolean; seconds: number; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={live}
      title={live ? `Auto-refreshing every ${seconds}s` : "Auto-refresh paused"}
      className={cn(
        "border-border flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
        live ? "text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {live ? (
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full"
          style={{ background: "var(--status-good)" }}
        />
      ) : (
        <Play size={12} aria-hidden />
      )}
      {live ? `Live ${seconds}s` : "Paused"}
      {live && <Pause size={12} aria-hidden className="text-muted-foreground" />}
    </button>
  );
}

export function ThemeToggle({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (t)`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="border-border text-muted-foreground hover:bg-secondary hover:text-foreground grid size-[34px] shrink-0 place-items-center rounded-md border transition-colors"
    >
      {theme === "dark" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
    </button>
  );
}
