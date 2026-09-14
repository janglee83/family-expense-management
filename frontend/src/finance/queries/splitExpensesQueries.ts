import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSplitExpenseGroup,
  listSplitExpenseGroups,
  previewSplitExpenseGroup,
  previewSplitExpenseGroupSettlement,
  settleSplitExpenseGroupSettlement,
  updateSplitExpenseGroup,
  type CreateSplitExpenseGroupInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useSplitExpenseGroups(familyId: string) {
  return useQuery({
    queryKey: financeKeys.splitExpenseGroups(familyId),
    queryFn: () => listSplitExpenseGroups(familyId),
    enabled: Boolean(familyId),
  });
}

export function usePreviewSplitExpenseGroup(familyId: string) {
  return useMutation({
    mutationFn: ({ fromDate, toDate, excludeGroupId }: { fromDate: string; toDate: string; excludeGroupId?: string }) =>
      previewSplitExpenseGroup(familyId, fromDate, toDate, excludeGroupId),
  });
}

export function usePreviewSplitExpenseGroupSettlement(familyId: string) {
  return useMutation({
    mutationFn: ({
      input,
      excludeGroupId,
    }: {
      input: CreateSplitExpenseGroupInput;
      excludeGroupId?: string;
    }) => previewSplitExpenseGroupSettlement(familyId, input, excludeGroupId),
  });
}

export function useSaveSplitExpenseGroup(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string | null; input: CreateSplitExpenseGroupInput }) =>
      groupId ? updateSplitExpenseGroup(familyId, groupId, input) : createSplitExpenseGroup(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.splitExpenseGroups(familyId) });
    },
  });
}

export function useSettleSplitExpenseGroupSettlement(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      settlementId,
      isSettled,
    }: {
      groupId: string;
      settlementId: string;
      isSettled: boolean;
    }) => settleSplitExpenseGroupSettlement(familyId, groupId, settlementId, isSettled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.splitExpenseGroups(familyId) });
    },
  });
}
