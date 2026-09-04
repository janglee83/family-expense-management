import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { cn } from "../cn";
import * as DialogPrimitive from "./Dialog";
import * as DropdownMenuPrimitive from "./DropdownMenu";
import * as PopoverPrimitive from "./Popover";
import * as ToastPrimitive from "./Toast";

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return <DialogPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-80 bg-foreground/45 backdrop-blur-sm", className)} {...props} />;
});

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "surface-elevated fixed left-1/2 top-1/2 z-80 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Content
      ref={ref}
      className={cn("surface-elevated z-60 overflow-hidden p-1", className)}
      {...props}
    />
  );
});

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Content
      ref={ref}
      className={cn("surface-elevated z-60 w-[min(25rem,95vw)] space-y-4 p-4", className)}
      {...props}
    />
  );
});

export const ToastRoot = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(function ToastRoot({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        "pointer-events-auto flex min-h-12 w-full max-w-md items-center justify-between gap-3 rounded-md border px-3 py-2 shadow-lg",
        className,
      )}
      {...props}
    />
  );
});

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(function ToastViewport({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-5 z-90 flex max-h-screen flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:w-auto sm:items-end",
        className,
      )}
      {...props}
    />
  );
});
