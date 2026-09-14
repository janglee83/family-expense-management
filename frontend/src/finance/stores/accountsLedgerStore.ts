import { create } from "zustand";
import type { AccountType, LedgerTransactionType } from "../financeApi";

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
  accountForm: AccountFormState;
  ledgerForm: LedgerFormState;
  setAccountForm: (patch: Partial<AccountFormState>) => void;
  setLedgerForm: (patch: Partial<LedgerFormState>) => void;
  resetAccountForm: () => void;
  resetLedgerForm: () => void;
}

function defaultDate(): string {
  return new Date().toISOString().slice(0, 10);
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

export const useAccountsLedgerStore = create<AccountsLedgerStore>((set) => ({
  accountForm: defaultAccountForm,
  ledgerForm: defaultLedgerForm,

  setAccountForm: (patch) => {
    set((state) => ({ accountForm: { ...state.accountForm, ...patch } }));
  },

  setLedgerForm: (patch) => {
    set((state) => ({ ledgerForm: { ...state.ledgerForm, ...patch } }));
  },

  resetAccountForm: () => {
    set({ accountForm: defaultAccountForm });
  },

  resetLedgerForm: () => {
    set((state) => ({
      ledgerForm: {
        ...state.ledgerForm,
        ledgerAmount: "",
        sourceAccountId: "",
        destinationAccountId: "",
        ledgerCategoryId: "",
        ledgerDescription: "",
      },
    }));
  },
}));
