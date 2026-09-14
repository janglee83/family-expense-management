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
  // financeKeys.subscriptionSummary(familyId) is a key-prefix descendant of
  // financeKeys.subscriptions(familyId), so this single invalidateQueries call (default
  // exact: false) already matches and refetches both the subscriptions list and the
  // summary query. A second, explicit invalidateQueries for the summary key would be
  // fully redundant and would cause an extra network refetch on every mutation.
  queryClient.invalidateQueries({ queryKey: financeKeys.subscriptions(familyId) });
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
