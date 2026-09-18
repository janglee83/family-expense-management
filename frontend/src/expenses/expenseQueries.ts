import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCategory,
  createExpense,
  deleteCategory,
  deleteExpense,
  listCategories,
  listExpenses,
  renameCategory,
  updateExpense,
  type ExpenseInput,
} from "./expenseApi";
import { tripKeys } from "../trips/queries/tripKeys";

export const expenseKeys = {
  categories: (familyId: string) => ["families", familyId, "categories"] as const,
  list: (familyId: string) => ["families", familyId, "expenses"] as const,
};

export function useCategories(familyId: string) {
  return useQuery({
    queryKey: expenseKeys.categories(familyId),
    queryFn: () => listCategories(familyId),
    enabled: Boolean(familyId),
  });
}

export function useExpenses(familyId: string) {
  return useQuery({
    queryKey: expenseKeys.list(familyId),
    queryFn: () => listExpenses(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string }) => createCategory(familyId, name, icon),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useRenameCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      renameCategory(familyId, categoryId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useDeleteCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(familyId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useCreateExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useUpdateExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, input }: { expenseId: string; input: ExpenseInput }) =>
      updateExpense(familyId, expenseId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useDeleteExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(familyId, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}
