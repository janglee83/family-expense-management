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
  settleSplitExpenseGroupParticipant,
  settleSplitExpenseItem,
  type SplitExpense,
  type SplitExpenseGroup,
  type SplitExpenseGroupPreview,
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
  month: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToDateRange(month: string): { periodStart: string; periodEnd: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const toIso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { periodStart: toIso(start), periodEnd: toIso(end) };
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
  setGroupForm: (patch: Partial<GroupFormState>) => void;
  toggleGroupParticipant: (userId: string) => void;
  setGroupCustomAmount: (userId: string, amount: string) => void;
  setGroupPercentage: (userId: string, percentage: string) => void;
  previewGroup: (familyId: string, t: Translate) => Promise<void>;
  createGroup: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  toggleGroupParticipantSettle: (
    familyId: string,
    groupId: string,
    participantId: string,
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
  month: currentYearMonth(),
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

  setGroupForm: (patch) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...patch },
      groupPreview: "month" in patch ? null : state.groupPreview,
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
      };
    });
  },

  setGroupCustomAmount: (userId, amount) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        customAmountByParticipant: { ...state.groupForm.customAmountByParticipant, [userId]: amount },
      },
    }));
  },

  setGroupPercentage: (userId, percentage) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        percentageByParticipant: { ...state.groupForm.percentageByParticipant, [userId]: percentage },
      },
    }));
  },

  previewGroup: async (familyId, t) => {
    const { groupForm } = get();
    const { periodStart, periodEnd } = monthToDateRange(groupForm.month);

    set({ isPreviewLoading: true, error: null });
    try {
      const preview = await previewSplitExpenseGroup(familyId, periodStart, periodEnd);
      set({ groupPreview: preview });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isPreviewLoading: false });
    }
  },

  createGroup: async (familyId, t, notify) => {
    const { groupForm, groupPreview } = get();

    if (!groupPreview || groupForm.participantIds.length === 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    const { periodStart, periodEnd } = monthToDateRange(groupForm.month);
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
      await createSplitExpenseGroup(familyId, {
        period_start: periodStart,
        period_end: periodEnd,
        method: groupForm.method,
        participants,
      });

      set({
        groupForm: { ...defaultGroupForm, month: groupForm.month },
        groupPreview: null,
        groups: await listSplitExpenseGroups(familyId),
      });
      notify({ message: t("finance.splitCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isGroupSaving: false });
    }
  },

  toggleGroupParticipantSettle: async (familyId, groupId, participantId, currentState, t, notify) => {
    set({ error: null });

    try {
      const updated = await settleSplitExpenseGroupParticipant(
        familyId,
        groupId,
        participantId,
        !currentState,
      );
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
