import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTripParticipant,
  createTrip,
  createTripItem,
  deleteTrip,
  deleteTripItem,
  getTrip,
  listTrips,
  removeTripParticipant,
  updateTrip,
  updateTripItem,
  type CreateTripInput,
  type CreateTripItemInput,
  type UpdateTripInput,
  type UpdateTripItemInput,
} from "../tripApi";
import { tripKeys } from "./tripKeys";

export function useTrips(familyId: string) {
  return useQuery({
    queryKey: tripKeys.list(familyId),
    queryFn: () => listTrips(familyId),
    enabled: Boolean(familyId),
  });
}

export function useTripDetail(familyId: string, tripId: string) {
  return useQuery({
    queryKey: tripKeys.detail(familyId, tripId),
    queryFn: () => getTrip(familyId, tripId),
    enabled: Boolean(familyId) && Boolean(tripId),
  });
}

export function useCreateTrip(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => createTrip(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useUpdateTrip(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTripInput) => updateTrip(familyId, tripId, input),
    onSuccess: () => {
      // tripKeys.detail(familyId, tripId) is a key-prefix descendant of tripKeys.list(familyId),
      // so this single invalidateQueries call (default exact: false) already matches and
      // refetches both the trip list and this trip's detail query.
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useDeleteTrip(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => deleteTrip(familyId, tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useAddTripParticipant(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addTripParticipant(familyId, tripId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useRemoveTripParticipant(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTripParticipant(familyId, tripId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useCreateTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripItemInput) => createTripItem(familyId, tripId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useUpdateTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateTripItemInput }) =>
      updateTripItem(familyId, tripId, itemId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useDeleteTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteTripItem(familyId, tripId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}
