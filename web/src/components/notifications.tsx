import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildHash } from "@/lib/nav";
import { relative } from "@/lib/viz";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/contracts";

const TONE: Record<string, string> = {
  critical: "var(--sev-error)",
  warning: "var(--sev-warning)",
  info: "var(--muted-foreground)"
};

/**
 * Tracks which notification ids this browser has already shown.
 *
 * Without it a 5-second poll re-announces the same incident every five
 * seconds, which is worse than not notifying at all. Seen ids live in
 * sessionStorage so a reload does not replay a morning's worth of toasts, and
 * every access is guarded — storage throws in a private window.
 */
const SEEN_KEY = "vantage-seen-notifications";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  try {
    // Bounded: only the most recent few hundred matter for dedupe.
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)));
  } catch {
    /* private window, blocked storage — dedupe degrades, nothing breaks */
  }
}

/**
 * The bell: unread count, a panel listing everything current, and a toast for
 * anything that arrived since the last poll.
 */
export function NotificationCentre({ notifications }: { notifications: Notification[] }) {
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The FIRST PAYLOAD seeds the seen set without toasting: arriving at a
  // dashboard that already has four open incidents should not fire four
  // toasts. Seeding on first render instead of first payload does not work —
  // the first render has no data yet, so everything looks new when it lands.
  useEffect(() => {
    if (notifications.length === 0) return;
    if (seen.current === null) {
      seen.current = readSeen();
      const first = notifications.filter((n) => !seen.current!.has(n.id));
      for (const n of first) seen.current.add(n.id);
      writeSeen(seen.current);
      return;
    }

    const fresh = notifications.filter((n) => !seen.current!.has(n.id));
    if (fresh.length === 0) return;
    for (const n of fresh) seen.current.add(n.id);
    writeSeen(seen.current);
    setToasts((current) => [...fresh, ...current].slice(0, 3));
  }, [notifications]);

  // Toasts retire themselves: 8s for warnings, 20s for critical. Critical ones
  // used to stay until dismissed, which turned three simultaneous incidents
  // into a permanent wall over the page — the bell holds them anyway, so the
  // toast only has to carry the interruption, not the record.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(
        () => setToasts((current) => current.filter((c) => c.id !== t.id)),
        t.severity === "critical" ? 20_000 : 8_000
      )
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("mousedown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  const critical = notifications.filter((n) => n.severity === "critical").length;
  const count = notifications.length;

  return (
    <>
      <div className="relative" ref={panel}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={count === 0 ? "Notifications, none" : `Notifications, ${count} open`}
          title={count === 0 ? "Nothing to report" : `${count} open · ${critical} critical`}
          className={cn(
            "border-border text-muted-foreground hover:text-foreground relative grid size-[34px] place-items-center rounded-md border transition-colors",
            open && "bg-secondary text-foreground"
          )}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M10.3 21a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {count > 0 && (
            <span
              className="absolute -top-1 -right-1 grid min-w-[16px] place-items-center rounded-full px-1 text-[0.6rem] leading-[16px] font-semibold"
              style={{
                background: critical > 0 ? "var(--sev-error)" : "var(--sev-warning)",
                color: "#fff"
              }}
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>

        {open && (
          <div className="bg-popover border-border absolute top-[calc(100%+6px)] right-0 z-50 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border shadow-xl">
            <div className="border-border bg-popover sticky top-0 flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              <span className="text-muted-foreground text-xs">
                {count === 0 ? "nothing open" : `${count} open`}
              </span>
            </div>

            {count === 0 ? (
              <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                Nothing is breaching and no anomaly stands out.
              </p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <a
                      href={buildHash(n.link.page as never, n.link.params)}
                      onClick={() => setOpen(false)}
                      className="border-border/40 hover:bg-secondary/50 flex gap-3 border-b px-4 py-3 transition-colors last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{ background: TONE[n.severity] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          <span className="text-muted-foreground tabular shrink-0 text-[0.68rem]">
                            {relative(n.at)}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">{n.body}</p>
                        {/* Never colour alone: the severity is also a word. */}
                        <span className="mt-1 inline-block text-[0.62rem] font-medium tracking-wide uppercase" style={{ color: TONE[n.severity] }}>
                          {n.severity} · {n.kind}
                        </span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />
    </>
  );
}

/**
 * Toasts render through a portal to <body>.
 *
 * The bell lives in the sticky header, and that header carries `backdrop-blur`.
 * A backdrop-filter ancestor becomes the containing block for `position:
 * fixed`, so a toast anchored "bottom right of the viewport" was being
 * anchored to the header instead and rendered off the top of the screen.
 */
function Toasts({ toasts, onDismiss }: { toasts: Notification[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0 || typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-popover pointer-events-auto rounded-lg border px-4 py-3 shadow-xl"
          style={{ borderColor: `color-mix(in oklab, ${TONE[t.severity]} 45%, transparent)`, borderLeftWidth: 3 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t.body}</p>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground shrink-0 text-sm leading-none"
            >
              ×
            </button>
          </div>
          <a
            href={buildHash(t.link.page as never, t.link.params)}
            onClick={() => onDismiss(t.id)}
            className="mt-2 inline-block text-xs underline"
            style={{ color: TONE[t.severity] }}
          >
            Open →
          </a>
        </div>
      ))}
    </div>,
    document.body
  );
}
