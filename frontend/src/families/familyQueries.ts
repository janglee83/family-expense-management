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
      queryClient.invalidateQueries({ queryKey: familyKeys.list });
    },
  });
}

export function useRenameFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameFamily(familyId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useDeleteFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteFamily(familyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.list });
    },
  });
}

export function useAddMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => addMember(familyId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useRemoveMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(familyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useChangeMemberRole(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      changeMemberRole(familyId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}
