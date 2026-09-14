import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import { useNetWorth } from "./analyticsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("useNetWorth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the snapshot from getNetWorth for the given family and range", async () => {
    vi.mocked(financeApi.getNetWorth).mockResolvedValue({
      as_of: "2026-09-30",
      assets_total: 600000,
      change_amount: 10000,
      change_percentage: 2,
      current_net_worth: 500000,
      liabilities_total: 100000,
      period_end: "2026-09-30",
      period_start: "2026-09-01",
      previous_net_worth: 490000,
    });

    const { result } = renderHook(
      () => useNetWorth("fam-1", { startDate: "2026-09-01", endDate: "2026-09-30" }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.data?.current_net_worth).toBe(500000));
    expect(financeApi.getNetWorth).toHaveBeenCalledWith("fam-1", {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("does not fetch when familyId is empty", () => {
    renderHook(() => useNetWorth("", { startDate: "2026-09-01", endDate: "2026-09-30" }), {
      wrapper: createQueryWrapper(),
    });

    expect(financeApi.getNetWorth).not.toHaveBeenCalled();
  });
});
