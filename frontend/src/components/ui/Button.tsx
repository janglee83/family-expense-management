import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonClassName";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    loadingLabel,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClassName({ variant, size, className })}
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "true" : "false"}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? loadingLabel ?? children : children}
    </button>
  );
});
