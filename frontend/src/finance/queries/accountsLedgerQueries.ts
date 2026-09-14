import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount,
  createLedgerTransaction,
  listLedgerTransactions,
  updateAccount,
  type CreateAccountInput,
  type CreateLedgerTransactionInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export { useAccounts } from "./goalsQueries";

export function useLedgerTransactions(familyId: string) {
  return useQuery({
    queryKey: financeKeys.ledgerTransactions(familyId),
    queryFn: () => listLedgerTransactions(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateAccount(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
    },
  });
}

export function useToggleAccountActive(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, isActive }: { accountId: string; isActive: boolean }) =>
      updateAccount(familyId, accountId, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
    },
  });
}

export function useCreateLedgerTransaction(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLedgerTransactionInput) => createLedgerTransaction(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.ledgerTransactions(familyId) });
    },
  });
}
