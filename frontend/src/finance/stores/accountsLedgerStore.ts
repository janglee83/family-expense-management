import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listCategories, type Category } from "../../expenses/expenseApi";
import { getFamilyDetail } from "../../families/familyApi";
import {
  createAccount as createAccountApi,
  createLedgerTransaction,
  listAccounts,
  listLedgerTransactions,
  updateAccount,
  type Account,
  type AccountType,
  type LedgerTransaction,
  type LedgerTransactionType,
} from "../financeApi";
import type { Notify, Translate } from "./types";

interface AccountFormState {
  accountName: string;
  accountType: AccountType;
  openingBalance: string;
  creditLimit: string;
  statementClosingDay: string;
  paymentDueDay: string;
  minimumPayment: string;
}

interface LedgerFormState {
  ledgerType: LedgerTransactionType;
  ledgerAmount: string;
  ledgerDate: string;
  sourceAccountId: string;
  destinationAccountId: string;
  ledgerCategoryId: string;
  ledgerDescription: string;
}

interface AccountsLedgerStore {
  accounts: Account[];
  transactions: LedgerTransaction[];
  categories: Category[];
  familyCurrencyCode: string;
  isLoading: boolean;
  isCreatingAccount: boolean;
  isCreatingLedger: boolean;
  error: string | null;
  accountForm: AccountFormState;
  ledgerForm: LedgerFormState;
  setAccountForm: (patch: Partial<AccountFormState>) => void;
  setLedgerForm: (patch: Partial<LedgerFormState>) => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  createAccount: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  toggleAccountActive: (familyId: string, account: Account, t: Translate, notify: Notify) => Promise<void>;
  createLedger: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
}

function defaultDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const defaultAccountForm: AccountFormState = {
  accountName: "",
  accountType: "bank",
  openingBalance: "0",
  creditLimit: "",
  statementClosingDay: "",
  paymentDueDay: "",
  minimumPayment: "",
};

const defaultLedgerForm: LedgerFormState = {
  ledgerType: "expense",
  ledgerAmount: "",
  ledgerDate: defaultDate(),
  sourceAccountId: "",
  destinationAccountId: "",
  ledgerCategoryId: "",
  ledgerDescription: "",
};

async function loadPrimaryData(familyId: string): Promise<{
  familyCurrencyCode: string;
  accounts: Account[];
  transactions: LedgerTransaction[];
  categories: Category[];
}> {
  const [familyDetail, accountsResult, ledgerResult, categoryResult] = await Promise.all([
    getFamilyDetail(familyId),
    listAccounts(familyId),
    listLedgerTransactions(familyId),
    listCategories(familyId),
  ]);

  return {
    familyCurrencyCode: familyDetail.currency_code,
    accounts: accountsResult,
    transactions: ledgerResult,
    categories: categoryResult,
  };
}

async function loadAccountsAndTransactions(familyId: string): Promise<{
  accounts: Account[];
  transactions: LedgerTransaction[];
}> {
  const [accountsResult, ledgerResult] = await Promise.all([
    listAccounts(familyId),
    listLedgerTransactions(familyId),
  ]);

  return {
    accounts: accountsResult,
    transactions: ledgerResult,
  };
}

export const useAccountsLedgerStore = create<AccountsLedgerStore>((set, get) => ({
  accounts: [],
  transactions: [],
  categories: [],
  familyCurrencyCode: "jpy",
  isLoading: true,
  isCreatingAccount: false,
  isCreatingLedger: false,
  error: null,
  accountForm: defaultAccountForm,
  ledgerForm: defaultLedgerForm,

  setAccountForm: (patch) => {
    set((state) => ({ accountForm: { ...state.accountForm, ...patch } }));
  },

  setLedgerForm: (patch) => {
    set((state) => ({ ledgerForm: { ...state.ledgerForm, ...patch } }));
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });
    try {
      const result = await loadPrimaryData(familyId);
      set({ ...result });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  createAccount: async (familyId, t, notify) => {
    const { accountForm, familyCurrencyCode } = get();
    const opening = Number(accountForm.openingBalance);

    if (!Number.isFinite(opening)) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    set({ error: null, isCreatingAccount: true });

    try {
      await createAccountApi(familyId, {
        name: accountForm.accountName.trim(),
        account_type: accountForm.accountType,
        currency_code: familyCurrencyCode === "vnd" ? "vnd" : "jpy",
        opening_balance: opening,
        credit_limit: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.creditLimit) : null,
        statement_closing_day:
          accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.statementClosingDay) : null,
        payment_due_day: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.paymentDueDay) : null,
        minimum_payment: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.minimumPayment) : null,
      });

      const refreshed = await loadAccountsAndTransactions(familyId);
      set({ accounts: refreshed.accounts, transactions: refreshed.transactions, accountForm: defaultAccountForm });
      notify({ message: t("finance.accountCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isCreatingAccount: false });
    }
  },

  toggleAccountActive: async (familyId, account, t, notify) => {
    set({ error: null });
    try {
      const updated = await updateAccount(familyId, account.id, { is_active: !account.is_active });
      set((state) => ({
        accounts: state.accounts.map((item) => (item.id === updated.id ? updated : item)),
      }));
      notify({
        message: account.is_active ? t("finance.accountDisabled") : t("finance.accountEnabled"),
        variant: "success",
      });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  createLedger: async (familyId, t, notify) => {
    const { ledgerForm } = get();
    const amount = Number(ledgerForm.ledgerAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      set({ error: t("expense.amountMustBePositive") });
      return;
    }

    set({ error: null, isCreatingLedger: true });

    try {
      await createLedgerTransaction(familyId, {
        transaction_type: ledgerForm.ledgerType,
        amount,
        occurred_on: ledgerForm.ledgerDate,
        description: ledgerForm.ledgerDescription.trim() || null,
        category_id: ledgerForm.ledgerCategoryId || null,
        source_account_id: ledgerForm.sourceAccountId || null,
        destination_account_id: ledgerForm.destinationAccountId || null,
      });

      const refreshed = await loadAccountsAndTransactions(familyId);
      set((state) => ({
        accounts: refreshed.accounts,
        transactions: refreshed.transactions,
        ledgerForm: {
          ...state.ledgerForm,
          ledgerAmount: "",
          sourceAccountId: "",
          destinationAccountId: "",
          ledgerCategoryId: "",
          ledgerDescription: "",
        },
      }));
      notify({ message: t("finance.ledgerCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isCreatingLedger: false });
    }
  },
}));
