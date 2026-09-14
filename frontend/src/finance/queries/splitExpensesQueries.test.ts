import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  usePreviewSplitExpenseGroup,
  usePreviewSplitExpenseGroupSettlement,
  useSaveSplitExpenseGroup,
  useSettleSplitExpenseGroupSettlement,
  useSplitExpenseGroups,
} from "./splitExpensesQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("splitExpensesQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useSplitExpenseGroups returns the list from listSplitExpenseGroups", async () => {
    vi.mocked(financeApi.listSplitExpenseGroups).mockResolvedValue([]);
    const { result } = renderHook(() => useSplitExpenseGroups("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("usePreviewSplitExpenseGroup calls previewSplitExpenseGroup with the given range", async () => {
    vi.mocked(financeApi.previewSplitExpenseGroup).mockResolvedValue({ total_amount: 0, expenses: [] });
    const { result } = renderHook(() => usePreviewSplitExpenseGroup("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ fromDate: "2026-09-01", toDate: "2026-09-30" });
    });

    expect(financeApi.previewSplitExpenseGroup).toHaveBeenCalledWith("fam-1", "2026-09-01", "2026-09-30", undefined);
  });

  it("usePreviewSplitExpenseGroupSettlement calls previewSplitExpenseGroupSettlement with the given input", async () => {
    vi.mocked(financeApi.previewSplitExpenseGroupSettlement).mockResolvedValue({ settlements: [] });
    const { result } = renderHook(() => usePreviewSplitExpenseGroupSettlement("fam-1"), {
      wrapper: createQueryWrapper(),
    });
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.mutateAsync({ input });
    });

    expect(financeApi.previewSplitExpenseGroupSettlement).toHaveBeenCalledWith("fam-1", input, undefined);
  });

  it("useSaveSplitExpenseGroup calls createSplitExpenseGroup when no groupId is given, and invalidates the group list", async () => {
    vi.mocked(financeApi.createSplitExpenseGroup).mockResolvedValue({} as never);
    vi.mocked(financeApi.listSplitExpenseGroups).mockResolvedValue([]);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ save: useSaveSplitExpenseGroup("fam-1"), list: useSplitExpenseGroups("fam-1") }),
      { wrapper },
    );
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.save.mutateAsync({ groupId: null, input });
    });

    expect(financeApi.createSplitExpenseGroup).toHaveBeenCalledWith("fam-1", input);
    expect(financeApi.updateSplitExpenseGroup).not.toHaveBeenCalled();
    await waitFor(() => expect(financeApi.listSplitExpenseGroups).toHaveBeenCalledTimes(2));
  });

  it("useSaveSplitExpenseGroup calls updateSplitExpenseGroup when a groupId is given", async () => {
    vi.mocked(financeApi.updateSplitExpenseGroup).mockResolvedValue({} as never);
    const { result } = renderHook(() => useSaveSplitExpenseGroup("fam-1"), { wrapper: createQueryWrapper() });
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.mutateAsync({ groupId: "group-1", input });
    });

    expect(financeApi.updateSplitExpenseGroup).toHaveBeenCalledWith("fam-1", "group-1", input);
    expect(financeApi.createSplitExpenseGroup).not.toHaveBeenCalled();
  });

  it("useSettleSplitExpenseGroupSettlement calls settleSplitExpenseGroupSettlement with the given ids", async () => {
    vi.mocked(financeApi.settleSplitExpenseGroupSettlement).mockResolvedValue({} as never);
    const { result } = renderHook(() => useSettleSplitExpenseGroupSettlement("fam-1"), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "group-1", settlementId: "settle-1", isSettled: true });
    });

    expect(financeApi.settleSplitExpenseGroupSettlement).toHaveBeenCalledWith("fam-1", "group-1", "settle-1", true);
  });
});
