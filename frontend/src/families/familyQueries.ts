import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMember,
  changeMemberRole,
  createFamily,
  deleteFamily,
  getFamilyDetail,
  listMyFamilies,
  removeMember,
  renameFamily,
  type CreateFamilyInput,
} from "./familyApi";

export const familyKeys = {
  list: ["families"] as const,
  detail: (familyId: string) => ["families", familyId] as const,
};

export function useFamilies() {
  return useQuery({
    queryKey: familyKeys.list,
    queryFn: listMyFamilies,
  });
}

export function useFamilyDetail(familyId: string) {
  return useQuery({
    queryKey: familyKeys.detail(familyId),
    queryFn: () => getFamilyDetail(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFamilyInput) => createFamily(input),
    onSuccess: () => {
      // exact: true — familyKeys.list is also a key-prefix of expenseKeys/receiptKeys for
      // every family (["families", familyId, "categories" | "expenses" | "receipts"]).
      // Without exact: true this would also invalidate every family's expenses/categories/
      // receipts caches on any single family create.
      queryClient.invalidateQueries({ queryKey: familyKeys.list, exact: true });
    },
  });
}

export function useRenameFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameFamily(familyId, name),
    onSuccess: () => {
      // exact: true — familyKeys.detail(familyId) is also a key-prefix of this family's
      // expenseKeys/receiptKeys. Without exact: true this would also invalidate that
      // family's expenses/categories/receipts caches even though nothing about them changed.
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId), exact: true });
    },
  });
}

export function useDeleteFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteFamily(familyId),
    onSuccess: () => {
      // exact: true — see useCreateFamily above.
      queryClient.invalidateQueries({ queryKey: familyKeys.list, exact: true });
    },
  });
}

export function useAddMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => addMember(familyId, email),
    onSuccess: () => {
      // exact: true — see useRenameFamily above.
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId), exact: true });
    },
  });
}

export function useRemoveMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(familyId, userId),
    onSuccess: () => {
      // exact: true — see useRenameFamily above.
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId), exact: true });
    },
  });
}

export function useChangeMemberRole(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      changeMemberRole(familyId, userId, role),
    onSuccess: () => {
      // exact: true — see useRenameFamily above.
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId), exact: true });
    },
  });
}
