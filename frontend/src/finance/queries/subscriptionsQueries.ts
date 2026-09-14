import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSubscription,
  deleteSubscription,
  getSubscriptionSummary,
  listSubscriptions,
  updateSubscription,
  type CreateSubscriptionInput,
  type SubscriptionStatus,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useSubscriptions(familyId: string) {
  return useQuery({
    queryKey: financeKeys.subscriptions(familyId),
    queryFn: () => listSubscriptions(familyId),
    enabled: Boolean(familyId),
  });
}

export function useSubscriptionSummary(familyId: string) {
  return useQuery({
    queryKey: financeKeys.subscriptionSummary(familyId),
    queryFn: () => getSubscriptionSummary(familyId),
    enabled: Boolean(familyId),
  });
}

function invalidateSubscriptions(queryClient: ReturnType<typeof useQueryClient>, familyId: string) {
  queryClient.invalidateQueries({ queryKey: financeKeys.subscriptions(familyId) });
  queryClient.invalidateQueries({ queryKey: financeKeys.subscriptionSummary(familyId) });
}

export function useCreateSubscription(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => createSubscription(familyId, input),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}

export function useChangeSubscriptionStatus(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, status }: { subscriptionId: string; status: SubscriptionStatus }) =>
      updateSubscription(familyId, subscriptionId, { status }),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}

export function useDeleteSubscription(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) => deleteSubscription(familyId, subscriptionId),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}
