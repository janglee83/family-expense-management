import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteReceipt, listReceipts, uploadReceipt } from "./receiptApi";

export const receiptKeys = {
  list: (familyId: string) => ["families", familyId, "receipts"] as const,
};

export function useReceipts(familyId: string) {
  return useQuery({
    queryKey: receiptKeys.list(familyId),
    queryFn: () => listReceipts(familyId),
    enabled: Boolean(familyId),
  });
}

export function useUploadReceipt(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadReceipt(familyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.list(familyId) });
    },
  });
}

export function useDeleteReceipt(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) => deleteReceipt(familyId, receiptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.list(familyId) });
    },
  });
}
