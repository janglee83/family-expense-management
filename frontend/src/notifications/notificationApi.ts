import { apiClient } from "../api/client";
import { buildApiError } from "../api/errors";
import type { components } from "../api/schema.gen";

export type NotificationItem = components["schemas"]["NotificationResponse"];

export async function listNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationItem[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/notifications/", {
    params: {
      query: {
        limit: options?.limit,
        unread_only: options?.unreadOnly,
      },
    },
  });

  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_notifications_failed",
      fallbackMessage: "Failed to list notifications",
    });
  }

  return data;
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/notifications/{notification_id}/read",
    { params: { path: { notification_id: notificationId } } },
  );

  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "mark_notification_read_failed",
      fallbackMessage: "Failed to mark notification as read",
    });
  }

  return data;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await apiClient.POST("/api/v1/notifications/read-all");

  if (error) {
    throw buildApiError({
      status: 500,
      payload: error,
      fallbackCode: "mark_all_notifications_read_failed",
      fallbackMessage: "Failed to mark all notifications as read",
    });
  }
}
