import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listExpenses, type Expense } from "../../expenses/expenseApi";
import { getFamilyDetail, type FamilyDetail } from "../../families/familyApi";
import {
  createSplitExpense,
  listSplitExpenses,
  settleSplitExpenseItem,
  type SplitExpense,
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
  toggleSettle: (familyId: string, splitId: string, itemId: string, currentState: boolean, t: Translate, notify: Notify) => Promise<void>;
}

const defaultForm: SplitFormState = {
  expenseId: "",
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
        customAmountByParticipant: {
          ...state.form.customAmountByParticipant,
          [userId]: amount,
        },
      },
    }));
  },

  setPercentage: (userId, percentage) => {
    set((state) => ({
      form: {
        ...state.form,
        percentageByParticipant: {
          ...state.form.percentageByParticipant,
          [userId]: percentage,
        },
      },
    }));
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });

    try {
      const [family, expenses, splits] = await Promise.all([
        getFamilyDetail(familyId),
        listExpenses(familyId),
        listSplitExpenses(familyId),
      ]);
      set({ family, expenses, splits });
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
        return {
          ...base,
          amount: Number(form.customAmountByParticipant[participantId] ?? 0),
        };
      }

      if (form.method === "percentage") {
        return {
          ...base,
          percentage: Number(form.percentageByParticipant[participantId] ?? 0),
        };
      }

      return base;
    });

    set({ error: null, isSaving: true });

    try {
      await createSplitExpense(familyId, {
        expense_id: form.expenseId,
        method: form.method,
        participants,
      });

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
}));
