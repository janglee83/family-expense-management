import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { getFamilyDetail } from "../../families/familyApi";
import {
  createGoal,
  createGoalEntry,
  deleteGoal,
  listAccounts,
  listGoalEntries,
  listGoals,
  updateGoal,
  type Account,
  type Goal,
  type GoalEntry,
} from "../financeApi";
import type { Notify, Translate } from "./types";

interface GoalFormState {
  goalName: string;
  goalTarget: string;
  goalCurrent: string;
  goalDate: string;
  goalMonthlyContribution: string;
  goalIcon: string;
  goalLinkedAccountId: string;
}

interface GoalEntryFormState {
  entryAmount: string;
  entryType: "contribution" | "withdrawal";
  entryDate: string;
  entryNote: string;
}

interface GoalsStore {
  goals: Goal[];
  accounts: Account[];
  familyCurrencyCode: string;
  isLoading: boolean;
  isSavingGoal: boolean;
  isSavingEntry: boolean;
  error: string | null;
  goalForm: GoalFormState;
  entryGoal: Goal | null;
  entryForm: GoalEntryFormState;
  selectedGoalEntries: GoalEntry[];
  setGoalForm: (patch: Partial<GoalFormState>) => void;
  setEntryForm: (patch: Partial<GoalEntryFormState>) => void;
  closeEntryModal: () => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  createGoal: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  togglePause: (familyId: string, goal: Goal, t: Translate, notify: Notify) => Promise<void>;
  deleteGoal: (familyId: string, goalId: string, t: Translate, notify: Notify) => Promise<void>;
  openEntryModal: (familyId: string, goal: Goal) => Promise<void>;
  createEntry: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultGoalForm: GoalFormState = {
  goalName: "",
  goalTarget: "",
  goalCurrent: "0",
  goalDate: "",
  goalMonthlyContribution: "",
  goalIcon: "",
  goalLinkedAccountId: "",
};

const defaultEntryForm: GoalEntryFormState = {
  entryAmount: "",
  entryType: "contribution",
  entryDate: todayDate(),
  entryNote: "",
};

async function loadGoalsAndAccounts(familyId: string): Promise<{
  familyCurrencyCode: string;
  goals: Goal[];
  accounts: Account[];
}> {
  const [family, goalsResult, accountsResult] = await Promise.all([
    getFamilyDetail(familyId),
    listGoals(familyId),
    listAccounts(familyId),
  ]);

  return {
    familyCurrencyCode: family.currency_code,
    goals: goalsResult,
    accounts: accountsResult,
  };
}

export const useGoalsStore = create<GoalsStore>((set, get) => ({
  goals: [],
  accounts: [],
  familyCurrencyCode: "jpy",
  isLoading: true,
  isSavingGoal: false,
  isSavingEntry: false,
  error: null,
  goalForm: defaultGoalForm,
  entryGoal: null,
  entryForm: defaultEntryForm,
  selectedGoalEntries: [],

  setGoalForm: (patch) => {
    set((state) => ({ goalForm: { ...state.goalForm, ...patch } }));
  },

  setEntryForm: (patch) => {
    set((state) => ({ entryForm: { ...state.entryForm, ...patch } }));
  },

  closeEntryModal: () => {
    set({ entryGoal: null });
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });
    try {
      const result = await loadGoalsAndAccounts(familyId);
      set({ ...result });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  createGoal: async (familyId, t, notify) => {
    const { goalForm } = get();
    const targetAmount = Number(goalForm.goalTarget);
    const currentAmount = Number(goalForm.goalCurrent);

    if (!Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    set({ error: null, isSavingGoal: true });

    try {
      await createGoal(familyId, {
        name: goalForm.goalName.trim(),
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: goalForm.goalDate || null,
        monthly_contribution: goalForm.goalMonthlyContribution ? Number(goalForm.goalMonthlyContribution) : null,
        icon: goalForm.goalIcon.trim() || null,
        linked_account_id: goalForm.goalLinkedAccountId || null,
      });
      const goals = await listGoals(familyId);
      set({ goals, goalForm: defaultGoalForm });
      notify({ message: t("finance.goalCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isSavingGoal: false });
    }
  },

  togglePause: async (familyId, goal, t, notify) => {
    set({ error: null });
    try {
      await updateGoal(familyId, goal.id, { is_paused: !goal.is_paused });
      set({ goals: await listGoals(familyId) });
      notify({ message: t("finance.goalUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  deleteGoal: async (familyId, goalId, t, notify) => {
    set({ error: null });
    try {
      await deleteGoal(familyId, goalId);
      set((state) => ({ goals: state.goals.filter((goal) => goal.id !== goalId) }));
      notify({ message: t("finance.goalDeleted"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  openEntryModal: async (familyId, goal) => {
    set({
      entryGoal: goal,
      entryForm: { ...defaultEntryForm, entryDate: todayDate() },
      selectedGoalEntries: [],
    });

    try {
      set({ selectedGoalEntries: await listGoalEntries(familyId, goal.id) });
    } catch {
      set({ selectedGoalEntries: [] });
    }
  },

  createEntry: async (familyId, t, notify) => {
    const { entryGoal, entryForm } = get();
    if (!entryGoal) {
      return;
    }

    const amount = Number(entryForm.entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      set({ error: t("expense.amountMustBePositive") });
      return;
    }

    set({ error: null, isSavingEntry: true });

    try {
      await createGoalEntry(familyId, entryGoal.id, {
        amount,
        entry_type: entryForm.entryType,
        occurred_on: entryForm.entryDate,
        note: entryForm.entryNote.trim() || null,
      });

      const [goals, entries] = await Promise.all([
        listGoals(familyId),
        listGoalEntries(familyId, entryGoal.id),
      ]);

      set({
        goals,
        selectedGoalEntries: entries,
        entryForm: { ...entryForm, entryAmount: "", entryNote: "" },
      });
      notify({ message: t("finance.goalEntryAdded"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isSavingEntry: false });
    }
  },
}));
