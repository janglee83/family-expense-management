import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useAccounts,
  useCreateGoal,
  useCreateGoalEntry,
  useDeleteGoal,
  useGoalEntries,
  useGoals,
  useTogglePauseGoal,
} from "./goalsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("goalsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useAccounts returns the list from listAccounts", async () => {
    vi.mocked(financeApi.listAccounts).mockResolvedValue([]);
    const { result } = renderHook(() => useAccounts("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useGoals returns the list from listGoals", async () => {
    vi.mocked(financeApi.listGoals).mockResolvedValue([]);
    const { result } = renderHook(() => useGoals("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useGoalEntries is disabled until a goalId is given", async () => {
    vi.mocked(financeApi.listGoalEntries).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ goalId }: { goalId: string | undefined }) => useGoalEntries("fam-1", goalId), {
      wrapper: createQueryWrapper(),
      initialProps: { goalId: undefined as string | undefined },
    });

    expect(financeApi.listGoalEntries).not.toHaveBeenCalled();

    rerender({ goalId: "goal-1" });
    await waitFor(() => expect(financeApi.listGoalEntries).toHaveBeenCalledWith("fam-1", "goal-1"));
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useCreateGoal invalidates financeKeys.goals on success", async () => {
    vi.mocked(financeApi.listGoals).mockResolvedValue([]);
    vi.mocked(financeApi.createGoal).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => ({ create: useCreateGoal("fam-1"), list: useGoals("fam-1") }), { wrapper });

    await waitFor(() => expect(result.current.list.data).toEqual([]));

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Trip", target_amount: 1000, current_amount: 0 } as never);
    });

    await waitFor(() => expect(financeApi.listGoals).toHaveBeenCalledTimes(2));
  });

  it("useTogglePauseGoal calls updateGoal with is_paused", async () => {
    vi.mocked(financeApi.updateGoal).mockResolvedValue({} as never);
    const { result } = renderHook(() => useTogglePauseGoal("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ goalId: "goal-1", isPaused: true });
    });

    expect(financeApi.updateGoal).toHaveBeenCalledWith("fam-1", "goal-1", { is_paused: true });
  });

  it("useDeleteGoal calls deleteGoal with the bound familyId", async () => {
    vi.mocked(financeApi.deleteGoal).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteGoal("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("goal-1");
    });

    expect(financeApi.deleteGoal).toHaveBeenCalledWith("fam-1", "goal-1");
  });

  it("useCreateGoalEntry invalidates both financeKeys.goals and financeKeys.goalEntries on success", async () => {
    vi.mocked(financeApi.listGoals).mockResolvedValue([]);
    vi.mocked(financeApi.listGoalEntries).mockResolvedValue([]);
    vi.mocked(financeApi.createGoalEntry).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateGoalEntry("fam-1", "goal-1"),
        goals: useGoals("fam-1"),
        entries: useGoalEntries("fam-1", "goal-1"),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.goals.data).toEqual([]));
    await waitFor(() => expect(result.current.entries.data).toEqual([]));

    const goalsCallsBefore = vi.mocked(financeApi.listGoals).mock.calls.length;
    const entriesCallsBefore = vi.mocked(financeApi.listGoalEntries).mock.calls.length;

    await act(async () => {
      await result.current.create.mutateAsync({
        amount: 100,
        entry_type: "contribution",
        occurred_on: "2026-09-01",
      } as never);
    });

    await waitFor(() =>
      expect(vi.mocked(financeApi.listGoals).mock.calls.length).toBeGreaterThan(goalsCallsBefore)
    );
    await waitFor(() =>
      expect(vi.mocked(financeApi.listGoalEntries).mock.calls.length).toBeGreaterThan(entriesCallsBefore)
    );
  });
});
