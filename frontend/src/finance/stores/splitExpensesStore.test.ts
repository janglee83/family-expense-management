import { beforeEach, describe, expect, it } from "vitest";
import { useSplitExpensesStore } from "./splitExpensesStore";

describe("splitExpensesStore", () => {
  beforeEach(() => {
    useSplitExpensesStore.setState(useSplitExpensesStore.getInitialState(), true);
  });

  it("setGroupRange updates fromDate/toDate and clears any existing settlement preview", () => {
    useSplitExpensesStore.setState({
      settlementPreview: { settlements: [] },
    });

    useSplitExpensesStore.getState().setGroupRange({ fromDate: "2026-01-05", toDate: "2026-03-20" });

    const state = useSplitExpensesStore.getState();
    expect(state.groupForm.fromDate).toBe("2026-01-05");
    expect(state.groupForm.toDate).toBe("2026-03-20");
    expect(state.settlementPreview).toBeNull();
  });

  it("startEditGroup prefills groupForm from the given group and sets editingGroupId", () => {
    useSplitExpensesStore.getState().startEditGroup({
      id: "group-1",
      period_start: "2026-09-01",
      period_end: "2026-10-31",
      method: "equal",
      participants: [
        { id: "p1", split_expense_group_id: "group-1", participant_user_id: "u1", amount: 50, percentage: null, is_settled: false },
        { id: "p2", split_expense_group_id: "group-1", participant_user_id: "u2", amount: 50, percentage: null, is_settled: false },
      ],
    } as never);

    const state = useSplitExpensesStore.getState();
    expect(state.editingGroupId).toBe("group-1");
    expect(state.groupForm.fromDate).toBe("2026-09-01");
    expect(state.groupForm.toDate).toBe("2026-10-31");
    expect(state.groupForm.participantIds).toEqual(["u1", "u2"]);
  });

  it("cancelEditGroup clears editingGroupId and resets the form", () => {
    useSplitExpensesStore.setState({ editingGroupId: "group-1" });

    useSplitExpensesStore.getState().cancelEditGroup();

    expect(useSplitExpensesStore.getState().editingGroupId).toBeNull();
  });
});
