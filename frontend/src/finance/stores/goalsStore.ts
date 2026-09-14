import { create } from "zustand";
import type { Goal } from "../financeApi";

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
  goalForm: GoalFormState;
  entryGoal: Goal | null;
  entryForm: GoalEntryFormState;
  setGoalForm: (patch: Partial<GoalFormState>) => void;
  setEntryForm: (patch: Partial<GoalEntryFormState>) => void;
  openEntryModal: (goal: Goal) => void;
  closeEntryModal: () => void;
  resetGoalForm: () => void;
  resetEntryForm: () => void;
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

export const useGoalsStore = create<GoalsStore>((set) => ({
  goalForm: defaultGoalForm,
  entryGoal: null,
  entryForm: defaultEntryForm,

  setGoalForm: (patch) => {
    set((state) => ({ goalForm: { ...state.goalForm, ...patch } }));
  },

  setEntryForm: (patch) => {
    set((state) => ({ entryForm: { ...state.entryForm, ...patch } }));
  },

  openEntryModal: (goal) => {
    set({ entryGoal: goal, entryForm: { ...defaultEntryForm, entryDate: todayDate() } });
  },

  closeEntryModal: () => {
    set({ entryGoal: null });
  },

  resetGoalForm: () => {
    set({ goalForm: defaultGoalForm });
  },

  resetEntryForm: () => {
    set((state) => ({ entryForm: { ...state.entryForm, entryAmount: "", entryNote: "" } }));
  },
}));
