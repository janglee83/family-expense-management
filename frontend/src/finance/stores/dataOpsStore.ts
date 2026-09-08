import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listExpenses, type Expense } from "../../expenses/expenseApi";
import { getFamilyDetail } from "../../families/familyApi";
import {
  commitExpenseImport,
  deleteExpenseWithUndo,
  exportBackup,
  exportExpensesCsv,
  exportExpensesJson,
  previewExpenseImport,
  restoreUndoAction,
  type ExpenseImportPreview,
} from "../financeApi";
import type { Notify, Translate } from "./types";

interface DataOpsStore {
  expenses: Expense[];
  familyCurrencyCode: string;
  previewResult: ExpenseImportPreview | null;
  undoToken: string;
  selectedFile: File | null;
  skipDuplicates: boolean;
  isLoading: boolean;
  isPreviewing: boolean;
  isImporting: boolean;
  isRestoring: boolean;
  error: string | null;
  setSelectedFile: (file: File | null) => void;
  setSkipDuplicates: (value: boolean) => void;
  setUndoToken: (value: string) => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  exportJson: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  exportCsv: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  exportBackup: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  previewImport: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  commitImport: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  deleteWithUndo: (familyId: string, expenseId: string, t: Translate, notify: Notify) => Promise<void>;
  restoreUndo: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
}

function downloadContent(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function nowFileStamp(): string {
  return new Date().toISOString().replaceAll(":", "-").slice(0, 19);
}

export const useDataOpsStore = create<DataOpsStore>((set, get) => ({
  expenses: [],
  familyCurrencyCode: "jpy",
  previewResult: null,
  undoToken: "",
  selectedFile: null,
  skipDuplicates: true,
  isLoading: true,
  isPreviewing: false,
  isImporting: false,
  isRestoring: false,
  error: null,

  setSelectedFile: (file) => {
    set({ selectedFile: file });
  },

  setSkipDuplicates: (value) => {
    set({ skipDuplicates: value });
  },

  setUndoToken: (value) => {
    set({ undoToken: value });
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });

    try {
      const [family, expenses] = await Promise.all([getFamilyDetail(familyId), listExpenses(familyId)]);
      set({ familyCurrencyCode: family.currency_code, expenses });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  exportJson: async (familyId, t, notify) => {
    set({ error: null });

    try {
      const payload = await exportExpensesJson(familyId);
      downloadContent(
        `expenses-${nowFileStamp()}.json`,
        "application/json",
        `${JSON.stringify(payload.items, null, 2)}\n`,
      );
      notify({ message: t("finance.exportJsonDone"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  exportCsv: async (familyId, t, notify) => {
    set({ error: null });

    try {
      const csvContent = await exportExpensesCsv(familyId);
      downloadContent(`expenses-${nowFileStamp()}.csv`, "text/csv", csvContent);
      notify({ message: t("finance.exportCsvDone"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  exportBackup: async (familyId, t, notify) => {
    set({ error: null });

    try {
      const payload = await exportBackup(familyId);
      downloadContent(
        `expenses-backup-${nowFileStamp()}.json`,
        "application/json",
        `${JSON.stringify(payload, null, 2)}\n`,
      );
      notify({ message: t("finance.exportBackupDone"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  previewImport: async (familyId, t, notify) => {
    const { selectedFile } = get();
    if (!selectedFile) {
      return;
    }

    set({ error: null, isPreviewing: true });

    try {
      const preview = await previewExpenseImport(familyId, selectedFile);
      set({ previewResult: preview });
      notify({ message: t("finance.previewReady"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message, previewResult: null });
      notify({ message, variant: "error" });
    } finally {
      set({ isPreviewing: false });
    }
  },

  commitImport: async (familyId, t, notify) => {
    const { previewResult, skipDuplicates } = get();
    if (!previewResult) {
      return;
    }

    const rows = previewResult.rows.map((row) => ({
      payer_user_id: row.payer_user_id,
      category_id: row.category_id,
      amount: row.amount,
      is_shared: row.is_shared,
      description: row.description ?? null,
      expense_date: row.expense_date,
    }));

    set({ error: null, isImporting: true });

    try {
      const result = await commitExpenseImport(familyId, {
        rows,
        skip_duplicates: skipDuplicates,
      });
      const expenses = await listExpenses(familyId);
      set({ previewResult: null, selectedFile: null, expenses });
      notify({
        message: t("finance.importDone", {
          created: result.created_count,
          skipped: result.skipped_duplicate_count,
        }),
        variant: "success",
      });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isImporting: false });
    }
  },

  deleteWithUndo: async (familyId, expenseId, t, notify) => {
    set({ error: null });

    try {
      const result = await deleteExpenseWithUndo(familyId, expenseId);
      set((state) => ({
        undoToken: result.undo_token,
        expenses: state.expenses.filter((item) => item.id !== expenseId),
      }));
      notify({ message: t("finance.deletedWithUndo"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  restoreUndo: async (familyId, t, notify) => {
    const undoToken = get().undoToken.trim();
    if (!undoToken) {
      return;
    }

    set({ error: null, isRestoring: true });

    try {
      await restoreUndoAction(familyId, undoToken);
      set({ expenses: await listExpenses(familyId), undoToken: "" });
      notify({ message: t("finance.undoRestored"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isRestoring: false });
    }
  },
}));
