import { useMutation, useQueryClient } from "@tanstack/react-query";
import { expenseKeys } from "../../expenses/expenseQueries";
import {
  commitExpenseImport,
  deleteExpenseWithUndo,
  exportBackup,
  exportExpensesCsv,
  exportExpensesJson,
  previewExpenseImport,
  restoreUndoAction,
  type ExpenseImportCommitInput,
} from "../financeApi";

export function useExportExpensesJson(familyId: string) {
  return useMutation({ mutationFn: () => exportExpensesJson(familyId) });
}

export function useExportExpensesCsv(familyId: string) {
  return useMutation({ mutationFn: () => exportExpensesCsv(familyId) });
}

export function useExportBackup(familyId: string) {
  return useMutation({ mutationFn: () => exportBackup(familyId) });
}

export function usePreviewExpenseImport(familyId: string) {
  return useMutation({ mutationFn: (file: File) => previewExpenseImport(familyId, file) });
}

export function useCommitExpenseImport(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseImportCommitInput) => commitExpenseImport(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useDeleteExpenseWithUndo(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpenseWithUndo(familyId, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useRestoreUndo(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (undoToken: string) => restoreUndoAction(familyId, undoToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}
