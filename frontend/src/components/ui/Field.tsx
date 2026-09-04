import type { ReactNode } from "react";
import { cn } from "./cn";

interface FieldProps {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  description,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "type-label inline-flex items-center gap-1",
          required && "after:text-destructive after:content-['*']",
        )}
      >
        <span>{label}</span>
      </label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
