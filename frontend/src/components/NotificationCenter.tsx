import { DropdownContent, DropdownMenu } from "./ui/primitives";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useSnackbar } from "./ui/Snackbar";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../notifications/notificationQueries";
import type { NotificationItem } from "../notifications/notificationApi";

function NotificationRow({
  item,
  onMarkRead,
  readLabel,
}: {
  item: NotificationItem;
  onMarkRead: (notificationId: string) => void;
  readLabel: string;
}) {
  const isRead = Boolean(item.read_at);

  return (
    <li
      className={`interactive-row flex items-start justify-between gap-3 ${
        isRead ? "opacity-75" : ""
      }`}
      data-state={isRead ? "read" : "unread"}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{item.message}</p>
        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
      </div>
      {!isRead ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onMarkRead(item.id)}>
          {readLabel}
        </Button>
      ) : null}
    </li>
  );
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const [isOpen, setIsOpen] = useState(false);
  // The badge must reflect the TRUE unread total, not just how many of the 20
  // most-recently-fetched notifications happen to be unread — a separate query
  // counts unread items outside that recent window too (up to the API's max limit).
  const latestQuery = useNotifications({ limit: 20 });
  const unreadQuery = useNotifications({ unreadOnly: true, limit: 100 });
  const notifications = latestQuery.data ?? [];
  const unreadCount = unreadQuery.data?.length ?? 0;
  const isLoading = latestQuery.isLoading || unreadQuery.isLoading;
  const lastNotificationIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const latest = latestQuery.data;
    if (!latest) {
      return;
    }

    if (latest.length > 0 && hasLoadedRef.current) {
      const newest = latest[0];
      if (newest.id !== lastNotificationIdRef.current && newest.read_at === null) {
        showSnackbar({ message: newest.message, variant: "info", durationMs: 3000 });
      }
    }

    lastNotificationIdRef.current = latest[0]?.id ?? null;
    hasLoadedRef.current = true;
  }, [latestQuery.data, showSnackbar]);

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  function handleMarkRead(notificationId: string) {
    markReadMutation.mutate(notificationId, {
      onError: () => showSnackbar({ message: t("notification.actionFailed"), variant: "error" }),
    });
  }

  function handleMarkAllRead() {
    markAllReadMutation.mutate(undefined, {
      onError: () => showSnackbar({ message: t("notification.actionFailed"), variant: "error" }),
    });
  }

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      if (nextOpen) {
        void latestQuery.refetch();
        void unreadQuery.refetch();
      }
    },
    [latestQuery, unreadQuery],
  );

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="relative h-10 w-10 p-0"
          aria-label={t("notification.title")}
          title={t("notification.title")}
          data-tour="header-notifications"
        >
          <span aria-hidden="true" className="text-base">
            🔔
          </span>
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1">
              <Badge variant="info">{unreadCount}</Badge>
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownContent
          align="end"
          sideOffset={8}
          className="w-[min(26rem,92vw)] p-3"
          aria-label={t("notification.title")}
        >
          <header className="mb-3 flex items-center justify-between gap-2 border-b border-border/80 pb-2">
            <h2 className="text-sm font-semibold text-foreground">{t("notification.title")}</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
            >
              {t("notification.markAllRead")}
            </Button>
          </header>

          {isLoading ? <p className="type-body-sm">{t("common.loading")}</p> : null}

          {!isLoading && notifications.length === 0 ? (
            <div className="surface-card p-4">
              <p className="type-body-sm">{t("notification.empty")}</p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {notifications.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onMarkRead={handleMarkRead}
                  readLabel={t("notification.markRead")}
                />
              ))}
            </ul>
          )}
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
