import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives that carry the information hierarchy.
 *
 * The dashboard has three levels and they are visually distinct on purpose:
 *   Section  — a major area (Health, Traffic, Reliability). Eyebrow + rule.
 *   Panel    — one card holding one idea.
 *   Row      — a line inside a panel.
 *
 * Without the Section level every card floats at the same weight and the page
 * reads as an undifferentiated wall, which is the main thing being fixed here.
 */

export function Section({
  eyebrow,
  title,
  description,
  right,
  children,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("scroll-mt-24", className)}>
      {/* Same rule as SectionHead: `description` is a tooltip, not a subtitle. */}
      <header className="border-border mb-3 flex flex-wrap items-end justify-between gap-3 border-b pb-2.5">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
          <h2 className="text-base leading-tight font-semibold tracking-tight" title={description}>
            {title}
          </h2>
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/** A labelled definition, used wherever a number needs saying what it is. */
export function Figure({
  label,
  value,
  help,
  tone,
  size = "md"
}: {
  label: string;
  value: string;
  help?: string;
  tone?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "text-base", md: "text-lg", lg: "text-2xl" };
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={cn("tabular mt-1 font-semibold", sizes[size])} style={{ color: tone }}>
        {value}
      </p>
      {help && <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{help}</p>}
    </div>
  );
}

/**
 * An inline explanation of what a metric means.
 *
 * Shown as persistent helper text rather than a hover tooltip: the brief asks
 * for the dashboard to be understandable at a glance, and a tooltip hides the
 * explanation behind an interaction the reader has to discover.
 */
export function Explain({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs leading-relaxed">{children}</p>;
}

export function Divider() {
  return <hr className="border-border my-8 border-0 border-t" />;
}
