import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listCategories, type Category } from "../../expenses/expenseApi";
import { getFamilyDetail } from "../../families/familyApi";
import {
  createSubscription,
  deleteSubscription,
  getSubscriptionSummary,
  listAccounts,
  listSubscriptions,
  updateSubscription,
  type Account,
  type Subscription,
  type SubscriptionBillingCycle,
  type SubscriptionStatus,
  type SubscriptionSummary,
} from "../financeApi";
import type { Notify, Translate } from "./types";

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
  subscriptions: Subscription[];
  summary: SubscriptionSummary | null;
  accounts: Account[];
  categories: Category[];
  familyCurrencyCode: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  form: SubscriptionFormState;
  setForm: (patch: Partial<SubscriptionFormState>) => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  createSubscription: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  changeStatus: (familyId: string, subscriptionId: string, nextStatus: SubscriptionStatus, t: Translate, notify: Notify) => Promise<void>;
  deleteSubscription: (familyId: string, subscriptionId: string, t: Translate, notify: Notify) => Promise<void>;
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

async function loadSubscriptionsData(familyId: string): Promise<{
  subscriptions: Subscription[];
  summary: SubscriptionSummary;
  categories: Category[];
  accounts: Account[];
  familyCurrencyCode: string;
}> {
  const [family, subscriptionsResult, summaryResult, categoriesResult, accountsResult] = await Promise.all([
    getFamilyDetail(familyId),
    listSubscriptions(familyId),
    getSubscriptionSummary(familyId),
    listCategories(familyId),
    listAccounts(familyId),
  ]);

  return {
    subscriptions: subscriptionsResult,
    summary: summaryResult,
    categories: categoriesResult,
    accounts: accountsResult,
    familyCurrencyCode: family.currency_code,
  };
}

async function reloadSubscriptionsData(familyId: string): Promise<{
  subscriptions: Subscription[];
  summary: SubscriptionSummary;
}> {
  const [subscriptionsResult, summaryResult] = await Promise.all([
    listSubscriptions(familyId),
    getSubscriptionSummary(familyId),
  ]);

  return {
    subscriptions: subscriptionsResult,
    summary: summaryResult,
  };
}

export const useSubscriptionsStore = create<SubscriptionsStore>((set, get) => ({
  subscriptions: [],
  summary: null,
  accounts: [],
  categories: [],
  familyCurrencyCode: "jpy",
  isLoading: true,
  isSaving: false,
  error: null,
  form: defaultForm,

  setForm: (patch) => {
    set((state) => ({ form: { ...state.form, ...patch } }));
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });

    try {
      set(await loadSubscriptionsData(familyId));
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  createSubscription: async (familyId, t, notify) => {
    const { form, familyCurrencyCode } = get();
    const parsedAmount = Number(form.amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      set({ error: t("expense.amountMustBePositive") });
      return;
    }

    set({ error: null, isSaving: true });

    try {
      await createSubscription(familyId, {
        name: form.name.trim(),
        merchant: form.merchant.trim(),
        amount: parsedAmount,
        currency_code: familyCurrencyCode === "vnd" ? "vnd" : "jpy",
        billing_cycle: form.billingCycle,
        next_billing_date: form.nextBillingDate,
        status: form.status,
        category_id: form.categoryId || null,
        account_id: form.accountId || null,
        cancellation_url: form.cancellationUrl.trim() || null,
      });

      const refreshed = await reloadSubscriptionsData(familyId);
      set({ ...refreshed, form: { ...defaultForm, nextBillingDate: todayDate() } });
      notify({ message: t("finance.subscriptionCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isSaving: false });
    }
  },

  changeStatus: async (familyId, subscriptionId, nextStatus, t, notify) => {
    set({ error: null });

    try {
      await updateSubscription(familyId, subscriptionId, { status: nextStatus });
      set(await reloadSubscriptionsData(familyId));
      notify({ message: t("finance.subscriptionUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  deleteSubscription: async (familyId, subscriptionId, t, notify) => {
    set({ error: null });

    try {
      await deleteSubscription(familyId, subscriptionId);
      const summary = await getSubscriptionSummary(familyId);
      set((state) => ({
        subscriptions: state.subscriptions.filter((subscription) => subscription.id !== subscriptionId),
        summary,
      }));
      notify({ message: t("finance.subscriptionDeleted"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },
}));
