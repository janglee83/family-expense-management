import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type AlertVariant = "info" | "success" | "warning" | "error";

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: "border-info/35 bg-info/10 text-foreground",
  success: "border-success/35 bg-success/10 text-foreground",
  warning: "border-warning/35 bg-warning/18 text-foreground",
  error: "border-destructive/35 bg-destructive/10 text-foreground",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return (
    <div
      className={cn("rounded-md border px-3 py-2 text-sm", VARIANT_CLASSES[variant], className)}
      role="status"
      {...props}
    />
  );
}
