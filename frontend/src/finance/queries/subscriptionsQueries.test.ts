import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useChangeSubscriptionStatus,
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptionSummary,
  useSubscriptions,
} from "./subscriptionsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("subscriptionsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useSubscriptions returns the list from listSubscriptions", async () => {
    vi.mocked(financeApi.listSubscriptions).mockResolvedValue([]);
    const { result } = renderHook(() => useSubscriptions("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useSubscriptionSummary returns the summary from getSubscriptionSummary", async () => {
    vi.mocked(financeApi.getSubscriptionSummary).mockResolvedValue({
      monthly_total: 0,
      yearly_total: 0,
      upcoming_subscription_ids: [],
    });
    const { result } = renderHook(() => useSubscriptionSummary("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.monthly_total).toBe(0));
  });

  it("useCreateSubscription invalidates both subscriptions and subscriptionSummary on success", async () => {
    vi.mocked(financeApi.listSubscriptions).mockResolvedValue([]);
    vi.mocked(financeApi.getSubscriptionSummary).mockResolvedValue({
      monthly_total: 0,
      yearly_total: 0,
      upcoming_subscription_ids: [],
    });
    vi.mocked(financeApi.createSubscription).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateSubscription("fam-1"),
        list: useSubscriptions("fam-1"),
        summary: useSubscriptionSummary("fam-1"),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.summary.isSuccess).toBe(true));

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Netflix" } as never);
    });

    // List: 1 initial fetch + 1 refetch triggered by invalidateQueries(financeKeys.subscriptions(...)).
    await waitFor(() => expect(financeApi.listSubscriptions).toHaveBeenCalledTimes(2));
    // Summary: 1 initial fetch + 2 refetches. financeKeys.subscriptionSummary(...) is nested under the
    // financeKeys.subscriptions(...) prefix, so both invalidateQueries calls in invalidateSubscriptions
    // match the summary query (one by prefix, one exactly), each triggering its own refetch. The count
    // (3, deterministic) still proves invalidation genuinely occurred for the summary query.
    await waitFor(() => expect(financeApi.getSubscriptionSummary).toHaveBeenCalledTimes(3));
  });

  it("useChangeSubscriptionStatus calls updateSubscription with the new status", async () => {
    vi.mocked(financeApi.updateSubscription).mockResolvedValue({} as never);
    const { result } = renderHook(() => useChangeSubscriptionStatus("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ subscriptionId: "sub-1", status: "paused" });
    });

    expect(financeApi.updateSubscription).toHaveBeenCalledWith("fam-1", "sub-1", { status: "paused" });
  });

  it("useDeleteSubscription calls deleteSubscription with the bound familyId", async () => {
    vi.mocked(financeApi.deleteSubscription).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteSubscription("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("sub-1");
    });

    expect(financeApi.deleteSubscription).toHaveBeenCalledWith("fam-1", "sub-1");
  });
});
