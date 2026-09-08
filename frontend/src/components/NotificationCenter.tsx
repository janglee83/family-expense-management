import { DropdownContent, DropdownMenu } from "./ui/primitives";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useSnackbar } from "./ui/Snackbar";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../notifications/notificationApi";

const POLL_INTERVAL_MS = 20000;

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
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastNotificationIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      // The badge must reflect the TRUE unread total, not just how many of
      // the 20 most-recently-fetched notifications happen to be unread —
      // fetch it separately so unread items outside that recent window are
      // still counted (up to the API's own max limit).
      const [latest, unread] = await Promise.all([
        listNotifications({ limit: 20 }),
        listNotifications({ unreadOnly: true, limit: 100 }),
      ]);
      setNotifications(latest);
      setUnreadCount(unread.length);

      if (latest.length > 0 && hasLoadedRef.current) {
        const newest = latest[0];
        if (newest.id !== lastNotificationIdRef.current && newest.read_at === null) {
          showSnackbar({ message: newest.message, variant: "info", durationMs: 3000 });
        }
      }

      lastNotificationIdRef.current = latest[0]?.id ?? null;
      hasLoadedRef.current = true;
    } catch {
      // Silent fallback: notification fetch should never block primary flows.
    } finally {
      setIsLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    void fetchNotifications();
    const timerId = window.setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [fetchNotifications]);

  async function handleMarkRead(notificationId: string) {
    try {
      const wasUnread = notifications.some(
        (item) => item.id === notificationId && item.read_at === null,
      );
      const updated = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? updated : item)),
      );
      if (wasUnread) {
        setUnreadCount((current) => Math.max(current - 1, 0));
      }
    } catch {
      showSnackbar({ message: t("notification.actionFailed"), variant: "error" });
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      showSnackbar({ message: t("notification.actionFailed"), variant: "error" });
    }
  }

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      if (nextOpen) {
        void fetchNotifications();
      }
    },
    [fetchNotifications],
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
              onClick={() => void handleMarkAllRead()}
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
                  onMarkRead={(notificationId) => void handleMarkRead(notificationId)}
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
