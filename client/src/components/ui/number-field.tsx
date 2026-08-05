import { Minus, Plus } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type NumberFieldProps = Omit<React.ComponentProps<"input">, "type" | "onChange" | "value"> & {
  value: string | number;
  onChange: (value: string) => void;
  /** Prefijo visual ($ etc.) */
  prefix?: string;
};

/**
 * Campo numérico con steppers del tema (sin flechas nativas del navegador).
 */
export function NumberField({
  value,
  onChange,
  prefix,
  min,
  max,
  step = "1",
  disabled,
  className,
  id,
  ...props
}: NumberFieldProps) {
  const stepNum = typeof step === "number" ? step : Number(step) || 1;
  const minNum = min != null && min !== "" ? Number(min) : undefined;
  const maxNum = max != null && max !== "" ? Number(max) : undefined;

  function nudge(dir: 1 | -1) {
    if (disabled) return;
    const current = Number(value);
    const base = Number.isFinite(current) ? current : minNum ?? 0;
    let next = base + dir * stepNum;
    // Evitar basura de float en steps 0.01
    const decimals = String(stepNum).includes(".")
      ? (String(stepNum).split(".")[1]?.length ?? 0)
      : 0;
    next = Number(next.toFixed(decimals));
    if (minNum != null && next < minNum) next = minNum;
    if (maxNum != null && next > maxNum) next = maxNum;
    onChange(String(next));
  }

  return (
    <div
      className={cn(
        "flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-2xl border border-border/80 bg-muted/40",
        "focus-within:ring-2 focus-within:ring-secondary focus-within:ring-offset-2 focus-within:ring-offset-background dark:focus-within:ring-primary",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {prefix ? (
        <span className="flex shrink-0 items-center border-r border-border/70 bg-muted/50 px-2.5 text-sm text-muted-foreground">
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
        {...props}
      />
      <div className="flex w-9 shrink-0 flex-col border-l border-border/70">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Aumentar"
          className="flex h-1/2 min-h-[1.25rem] items-center justify-center bg-primary/10 px-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          onClick={() => nudge(1)}
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Disminuir"
          className="flex h-1/2 min-h-[1.25rem] items-center justify-center border-t border-border/70 bg-muted/50 px-1.5 text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          onClick={() => nudge(-1)}
        >
          <Minus className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
