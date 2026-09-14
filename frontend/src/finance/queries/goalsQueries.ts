import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoal,
  createGoalEntry,
  deleteGoal,
  listAccounts,
  listGoalEntries,
  listGoals,
  updateGoal,
  type CreateGoalEntryInput,
  type CreateGoalInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useAccounts(familyId: string) {
  return useQuery({
    queryKey: financeKeys.accounts(familyId),
    queryFn: () => listAccounts(familyId),
    enabled: Boolean(familyId),
  });
}

export function useGoals(familyId: string) {
  return useQuery({
    queryKey: financeKeys.goals(familyId),
    queryFn: () => listGoals(familyId),
    enabled: Boolean(familyId),
  });
}

export function useGoalEntries(familyId: string, goalId: string | undefined) {
  return useQuery({
    queryKey: financeKeys.goalEntries(familyId, goalId ?? ""),
    queryFn: () => listGoalEntries(familyId, goalId ?? ""),
    enabled: Boolean(familyId) && Boolean(goalId),
  });
}

export function useCreateGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useTogglePauseGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, isPaused }: { goalId: string; isPaused: boolean }) =>
      updateGoal(familyId, goalId, { is_paused: isPaused }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useDeleteGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(familyId, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useCreateGoalEntry(familyId: string, goalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalEntryInput) => createGoalEntry(familyId, goalId, input),
    onSuccess: () => {
      // financeKeys.goalEntries(familyId, goalId) is a key-prefix descendant of
      // financeKeys.goals(familyId), so this single invalidateQueries call (default
      // exact: false) already matches and refetches both the goals list and the goal
      // entries query. A second, explicit invalidateQueries for the entries key would be
      // fully redundant and would cause an extra network refetch on every mutation.
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}
