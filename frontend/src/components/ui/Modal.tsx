import { Dialog, DialogContent, DialogOverlay } from "./primitives";
import { useId, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
}

export function Modal({
  isOpen,
  title,
  description,
  children,
  onClose,
  footer,
  closeOnBackdrop = true,
  closeLabel = "Close",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
          <DialogOverlay />
          <DialogContent
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          onInteractOutside={(event) => {
            if (!closeOnBackdrop) {
              event.preventDefault();
            }
          }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border/90 p-5">
            <div className="space-y-1">
              <Dialog.Title id={titleId} className="type-h2">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description id={descriptionId} className="type-body-sm">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>

            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm" aria-label={closeLabel}>
                {closeLabel}
              </Button>
            </Dialog.Close>
          </header>

          {children ? <div className="space-y-4 p-5">{children}</div> : null}

          {footer ? (
            <footer className={cn("flex flex-wrap justify-end gap-2 border-t border-border/90 p-5")}>
              {footer}
            </footer>
          ) : null}
          </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
