import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi";

const POLL_INTERVAL_MS = 20000;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (options?: { limit?: number; unreadOnly?: boolean }) => [...notificationKeys.all, options ?? {}] as const,
};

export function useNotifications(options?: { limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: notificationKeys.list(options),
    queryFn: () => listNotifications(options),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
