import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listExpenses, type Expense } from "../../expenses/expenseApi";
import { getFamilyDetail, type FamilyDetail } from "../../families/familyApi";
import {
  createSplitExpense,
  createSplitExpenseGroup,
  listSplitExpenseGroups,
  listSplitExpenses,
  previewSplitExpenseGroup,
  previewSplitExpenseGroupSettlement,
  settleSplitExpenseGroupSettlement,
  settleSplitExpenseItem,
  updateSplitExpenseGroup,
  type SplitExpense,
  type SplitExpenseGroup,
  type SplitExpenseGroupPreview,
  type SplitExpenseGroupSettlementPreview,
  type SplitMethod,
} from "../financeApi";
import type { Notify, Translate } from "./types";

interface SplitFormState {
  expenseId: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

interface GroupFormState {
  fromDate: string;
  toDate: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

function currentIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface SplitExpensesStore {
  family: FamilyDetail | null;
  expenses: Expense[];
  splits: SplitExpense[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  form: SplitFormState;
  setForm: (patch: Partial<SplitFormState>) => void;
  toggleParticipant: (userId: string) => void;
  setCustomAmount: (userId: string, amount: string) => void;
  setPercentage: (userId: string, percentage: string) => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  createSplit: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  toggleSettle: (
    familyId: string,
    splitId: string,
    itemId: string,
    currentState: boolean,
    t: Translate,
    notify: Notify,
  ) => Promise<void>;

  groups: SplitExpenseGroup[];
  groupPreview: SplitExpenseGroupPreview | null;
  isPreviewLoading: boolean;
  isGroupSaving: boolean;
  groupForm: GroupFormState;
  editingGroupId: string | null;
  settlementPreview: SplitExpenseGroupSettlementPreview | null;
  isSettlementPreviewLoading: boolean;
  setGroupRange: (range: { fromDate: string; toDate: string }) => void;
  setGroupForm: (patch: Partial<Omit<GroupFormState, "fromDate" | "toDate">>) => void;
  toggleGroupParticipant: (userId: string) => void;
  setGroupCustomAmount: (userId: string, amount: string) => void;
  setGroupPercentage: (userId: string, percentage: string) => void;
  previewGroup: (familyId: string, t: Translate) => Promise<void>;
  previewGroupSettlement: (familyId: string, t: Translate) => Promise<void>;
  startEditGroup: (group: SplitExpenseGroup) => void;
  cancelEditGroup: () => void;
  saveGroup: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  settleGroupSettlement: (
    familyId: string,
    groupId: string,
    settlementId: string,
    currentState: boolean,
    t: Translate,
    notify: Notify,
  ) => Promise<void>;
}

const defaultForm: SplitFormState = {
  expenseId: "",
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

const defaultGroupForm: GroupFormState = {
  fromDate: currentIsoDate(),
  toDate: currentIsoDate(),
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

export const useSplitExpensesStore = create<SplitExpensesStore>((set, get) => ({
  family: null,
  expenses: [],
  splits: [],
  isLoading: true,
  isSaving: false,
  error: null,
  form: defaultForm,

  setForm: (patch) => {
    set((state) => ({ form: { ...state.form, ...patch } }));
  },

  toggleParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.form.participantIds.includes(userId);
      return {
        form: {
          ...state.form,
          participantIds: hasParticipant
            ? state.form.participantIds.filter((id) => id !== userId)
            : [...state.form.participantIds, userId],
        },
      };
    });
  },

  setCustomAmount: (userId, amount) => {
    set((state) => ({
      form: {
        ...state.form,
        customAmountByParticipant: { ...state.form.customAmountByParticipant, [userId]: amount },
      },
    }));
  },

  setPercentage: (userId, percentage) => {
    set((state) => ({
      form: {
        ...state.form,
        percentageByParticipant: { ...state.form.percentageByParticipant, [userId]: percentage },
      },
    }));
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });

    try {
      const [family, expenses, splits, groups] = await Promise.all([
        getFamilyDetail(familyId),
        listExpenses(familyId),
        listSplitExpenses(familyId),
        listSplitExpenseGroups(familyId),
      ]);
      set({ family, expenses, splits, groups });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  createSplit: async (familyId, t, notify) => {
    const { form } = get();

    if (!form.expenseId || form.participantIds.length === 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    const participants = form.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };

      if (form.method === "custom") {
        return { ...base, amount: Number(form.customAmountByParticipant[participantId] ?? 0) };
      }

      if (form.method === "percentage") {
        return { ...base, percentage: Number(form.percentageByParticipant[participantId] ?? 0) };
      }

      return base;
    });

    set({ error: null, isSaving: true });

    try {
      await createSplitExpense(familyId, { expense_id: form.expenseId, method: form.method, participants });

      set({ form: defaultForm, splits: await listSplitExpenses(familyId) });
      notify({ message: t("finance.splitCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isSaving: false });
    }
  },

  toggleSettle: async (familyId, splitId, itemId, currentState, t, notify) => {
    set({ error: null });

    try {
      const updated = await settleSplitExpenseItem(familyId, splitId, itemId, !currentState);
      set((state) => ({
        splits: state.splits.map((split) => (split.id === updated.id ? updated : split)),
      }));
      notify({ message: t("finance.splitUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  groups: [],
  groupPreview: null,
  isPreviewLoading: false,
  isGroupSaving: false,
  groupForm: defaultGroupForm,
  editingGroupId: null,
  settlementPreview: null,
  isSettlementPreviewLoading: false,

  setGroupRange: (range) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...range },
      groupPreview: null,
      settlementPreview: null,
    }));
  },

  setGroupForm: (patch) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...patch },
      settlementPreview: null,
    }));
  },

  toggleGroupParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.groupForm.participantIds.includes(userId);
      return {
        groupForm: {
          ...state.groupForm,
          participantIds: hasParticipant
            ? state.groupForm.participantIds.filter((id) => id !== userId)
            : [...state.groupForm.participantIds, userId],
        },
        settlementPreview: null,
      };
    });
  },

  setGroupCustomAmount: (userId, amount) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        customAmountByParticipant: { ...state.groupForm.customAmountByParticipant, [userId]: amount },
      },
      settlementPreview: null,
    }));
  },

  setGroupPercentage: (userId, percentage) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        percentageByParticipant: { ...state.groupForm.percentageByParticipant, [userId]: percentage },
      },
      settlementPreview: null,
    }));
  },

  previewGroup: async (familyId, t) => {
    const { groupForm, editingGroupId } = get();

    set({ isPreviewLoading: true, error: null, settlementPreview: null });
    try {
      const preview = await previewSplitExpenseGroup(
        familyId,
        groupForm.fromDate,
        groupForm.toDate,
        editingGroupId ?? undefined,
      );
      set({ groupPreview: preview });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isPreviewLoading: false });
    }
  },

  previewGroupSettlement: async (familyId, t) => {
    const { groupForm, editingGroupId } = get();
    const participants = groupForm.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };
      if (groupForm.method === "custom") {
        return { ...base, amount: Number(groupForm.customAmountByParticipant[participantId] ?? 0) };
      }
      if (groupForm.method === "percentage") {
        return { ...base, percentage: Number(groupForm.percentageByParticipant[participantId] ?? 0) };
      }
      return base;
    });

    set({ isSettlementPreviewLoading: true, error: null });
    try {
      const preview = await previewSplitExpenseGroupSettlement(
        familyId,
        {
          period_start: groupForm.fromDate,
          period_end: groupForm.toDate,
          method: groupForm.method,
          participants,
        },
        editingGroupId ?? undefined,
      );
      set({ settlementPreview: preview });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isSettlementPreviewLoading: false });
    }
  },

  startEditGroup: (group) => {
    set({
      editingGroupId: group.id,
      // Seed the preview from the group itself so the edit form renders immediately
      // with the right expense list, without waiting on (or racing) a preview call.
      groupPreview: { total_amount: group.total_amount, expenses: group.expenses },
      settlementPreview: null,
      groupForm: {
        fromDate: group.period_start,
        toDate: group.period_end,
        method: group.method,
        participantIds: group.participants.map((participant) => participant.participant_user_id),
        customAmountByParticipant: Object.fromEntries(
          group.participants.map((participant) => [participant.participant_user_id, String(participant.amount)]),
        ),
        percentageByParticipant: Object.fromEntries(
          group.participants
            .filter((participant) => participant.percentage !== null)
            .map((participant) => [participant.participant_user_id, String(participant.percentage)]),
        ),
      },
    });
  },

  cancelEditGroup: () => {
    set({ editingGroupId: null, groupForm: defaultGroupForm, groupPreview: null, settlementPreview: null });
  },

  saveGroup: async (familyId, t, notify) => {
    const { groupForm, groupPreview, editingGroupId } = get();

    if (!groupPreview || groupForm.participantIds.length === 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    const participants = groupForm.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };
      if (groupForm.method === "custom") {
        return { ...base, amount: Number(groupForm.customAmountByParticipant[participantId] ?? 0) };
      }
      if (groupForm.method === "percentage") {
        return { ...base, percentage: Number(groupForm.percentageByParticipant[participantId] ?? 0) };
      }
      return base;
    });

    set({ error: null, isGroupSaving: true });

    try {
      const input = {
        period_start: groupForm.fromDate,
        period_end: groupForm.toDate,
        method: groupForm.method,
        participants,
      };
      if (editingGroupId) {
        await updateSplitExpenseGroup(familyId, editingGroupId, input);
      } else {
        await createSplitExpenseGroup(familyId, input);
      }

      set({
        groupForm: defaultGroupForm,
        editingGroupId: null,
        groupPreview: null,
        settlementPreview: null,
        groups: await listSplitExpenseGroups(familyId),
      });
      notify({ message: t(editingGroupId ? "finance.splitUpdated" : "finance.splitCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isGroupSaving: false });
    }
  },

  settleGroupSettlement: async (familyId, groupId, settlementId, currentState, t, notify) => {
    set({ error: null });

    try {
      const updated = await settleSplitExpenseGroupSettlement(familyId, groupId, settlementId, !currentState);
      set((state) => ({
        groups: state.groups.map((group) => (group.id === updated.id ? updated : group)),
      }));
      notify({ message: t("finance.splitUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },
}));
