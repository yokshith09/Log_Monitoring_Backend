import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const ALL = "ALL";

/**
 * A filter whose trigger always states WHICH field it filters.
 *
 * Five shadcn Selects in a row all reading "ALL" is the state this replaces:
 * the placeholder never shows once a value is set, so every trigger collapsed
 * to the same word and the row became five identical unlabelled boxes.
 *
 * The label is part of the trigger, Datadog/Grafana style — `Severity: All`,
 * `Severity: ERROR`. An applied filter also takes an accent border, so you can
 * see which of five are doing something without reading any of them.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  width = "w-[168px]",
  format
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  width?: string;
  format?: (option: string) => string;
}) {
  const applied = value !== ALL;
  const shown = applied ? (format ? format(value) : value) : "All";

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "bg-card h-8 gap-1.5 rounded-md px-2.5 text-xs",
          width,
          applied ? "border-ring/55 text-foreground" : "border-border text-muted-foreground"
        )}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-muted-foreground shrink-0">{label}</span>
          <span className={cn("truncate font-medium", applied ? "text-foreground" : "text-muted-foreground")}>
            {shown}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {format ? format(option) : option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One applied filter, as a removable chip. */
export function FilterChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="border-border bg-secondary/70 hover:bg-secondary text-foreground flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[0.7rem] transition-colors"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
      <span aria-hidden className="text-muted-foreground">
        ×
      </span>
    </button>
  );
}
