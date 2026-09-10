import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSplitExpensesStore } from "./splitExpensesStore";
import * as financeApi from "../financeApi";
import type { Translate } from "./types";

vi.mock("../financeApi");

const identityT: Translate = (key) => key;

describe("splitExpensesStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSplitExpensesStore.setState(useSplitExpensesStore.getInitialState(), true);
  });

  it("setGroupRange updates fromMonth/toMonth and clears any existing settlement preview", () => {
    useSplitExpensesStore.setState({
      settlementPreview: { settlements: [] },
    });

    useSplitExpensesStore.getState().setGroupRange({ fromMonth: "2026-01", toMonth: "2026-03" });

    const state = useSplitExpensesStore.getState();
    expect(state.groupForm.fromMonth).toBe("2026-01");
    expect(state.groupForm.toMonth).toBe("2026-03");
    expect(state.settlementPreview).toBeNull();
  });

  it("previewGroupSettlement stores the API result", async () => {
    vi.mocked(financeApi.previewSplitExpenseGroupSettlement).mockResolvedValue({
      settlements: [{ from_user_id: "u1", to_user_id: "u2", amount: 40 }],
    });
    useSplitExpensesStore.setState({
      groupPreview: { total_amount: 100, expenses: [] },
      groupForm: {
        fromMonth: "2026-09",
        toMonth: "2026-09",
        method: "equal",
        participantIds: ["u1", "u2"],
        customAmountByParticipant: {},
        percentageByParticipant: {},
      },
    });

    await useSplitExpensesStore.getState().previewGroupSettlement("family-1", identityT);

    expect(useSplitExpensesStore.getState().settlementPreview).toEqual({
      settlements: [{ from_user_id: "u1", to_user_id: "u2", amount: 40 }],
    });
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
    expect(state.groupForm.fromMonth).toBe("2026-09");
    expect(state.groupForm.toMonth).toBe("2026-10");
    expect(state.groupForm.participantIds).toEqual(["u1", "u2"]);
  });

  it("saveGroup calls createSplitExpenseGroup when not editing", async () => {
    vi.mocked(financeApi.createSplitExpenseGroup).mockResolvedValue({} as never);
    vi.mocked(financeApi.listSplitExpenseGroups).mockResolvedValue([]);
    useSplitExpensesStore.setState({
      groupPreview: { total_amount: 100, expenses: [] },
      editingGroupId: null,
      groupForm: {
        fromMonth: "2026-09",
        toMonth: "2026-09",
        method: "equal",
        participantIds: ["u1", "u2"],
        customAmountByParticipant: {},
        percentageByParticipant: {},
      },
    });

    await useSplitExpensesStore.getState().saveGroup("family-1", identityT, () => {});

    expect(financeApi.createSplitExpenseGroup).toHaveBeenCalledWith(
      "family-1",
      expect.objectContaining({
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        method: "equal",
        participants: [{ participant_user_id: "u1" }, { participant_user_id: "u2" }],
      }),
    );
    expect(financeApi.updateSplitExpenseGroup).not.toHaveBeenCalled();
  });

  it("saveGroup calls updateSplitExpenseGroup with the full payload when editing", async () => {
    vi.mocked(financeApi.updateSplitExpenseGroup).mockResolvedValue({} as never);
    vi.mocked(financeApi.listSplitExpenseGroups).mockResolvedValue([]);
    useSplitExpensesStore.setState({
      groupPreview: { total_amount: 100, expenses: [] },
      editingGroupId: "group-1",
      groupForm: {
        fromMonth: "2026-09",
        toMonth: "2026-10",
        method: "equal",
        participantIds: ["u1", "u2"],
        customAmountByParticipant: {},
        percentageByParticipant: {},
      },
    });

    await useSplitExpensesStore.getState().saveGroup("family-1", identityT, () => {});

    expect(financeApi.updateSplitExpenseGroup).toHaveBeenCalledWith(
      "family-1",
      "group-1",
      expect.objectContaining({
        period_start: "2026-09-01",
        period_end: "2026-10-31",
        method: "equal",
        participants: [{ participant_user_id: "u1" }, { participant_user_id: "u2" }],
      }),
    );
    expect(financeApi.createSplitExpenseGroup).not.toHaveBeenCalled();
  });

  it("cancelEditGroup clears editingGroupId and resets the form", () => {
    useSplitExpensesStore.setState({ editingGroupId: "group-1" });

    useSplitExpensesStore.getState().cancelEditGroup();

    expect(useSplitExpensesStore.getState().editingGroupId).toBeNull();
  });
});
