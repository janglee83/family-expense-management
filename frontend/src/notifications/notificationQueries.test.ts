import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { notificationKeys, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "./notificationQueries";
import * as notificationApi from "./notificationApi";

vi.mock("./notificationApi");

describe("notificationQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useNotifications passes its options through to listNotifications", async () => {
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const { result } = renderHook(() => useNotifications({ unreadOnly: true, limit: 100 }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(notificationApi.listNotifications).toHaveBeenCalledWith({ unreadOnly: true, limit: 100 });
  });

  it("caches distinct option sets under distinct keys", () => {
    expect(notificationKeys.list({ limit: 20 })).not.toEqual(notificationKeys.list({ unreadOnly: true, limit: 100 }));
  });

  it("useMarkNotificationRead invalidates every notificationKeys.list query on success", async () => {
    vi.mocked(notificationApi.markNotificationRead).mockResolvedValue({
      id: "n1",
      message: "hi",
      created_at: "2026-09-01T00:00:00Z",
      read_at: "2026-09-01T00:01:00Z",
    } as never);
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ mark: useMarkNotificationRead(), list: useNotifications({ limit: 20 }) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.mark.mutateAsync("n1");
    });

    await waitFor(() => expect(notificationApi.listNotifications).toHaveBeenCalledTimes(2));
  });

  it("useMarkAllNotificationsRead invalidates every notificationKeys.list query on success", async () => {
    vi.mocked(notificationApi.markAllNotificationsRead).mockResolvedValue(undefined);
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ markAll: useMarkAllNotificationsRead(), list: useNotifications({ limit: 20 }) }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await result.current.markAll.mutateAsync();
    });

    await waitFor(() => expect(notificationApi.listNotifications).toHaveBeenCalledTimes(2));
  });
});
