import { create } from "zustand";
import type { SubscriptionBillingCycle, SubscriptionStatus } from "../financeApi";

interface SubscriptionFormState {
  name: string;
  merchant: string;
  amount: string;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  categoryId: string;
  accountId: string;
  cancellationUrl: string;
}

interface SubscriptionsStore {
  form: SubscriptionFormState;
  setForm: (patch: Partial<SubscriptionFormState>) => void;
  resetForm: () => void;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultForm: SubscriptionFormState = {
  name: "",
  merchant: "",
  amount: "",
  billingCycle: "monthly",
  nextBillingDate: todayDate(),
  status: "active",
  categoryId: "",
  accountId: "",
  cancellationUrl: "",
};

export const useSubscriptionsStore = create<SubscriptionsStore>((set) => ({
  form: defaultForm,

  setForm: (patch) => {
    set((state) => ({ form: { ...state.form, ...patch } }));
  },

  resetForm: () => {
    set({ form: { ...defaultForm, nextBillingDate: todayDate() } });
  },
}));
