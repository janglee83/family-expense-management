export const tripKeys = {
  list: (familyId: string) => ["trips", familyId] as const,
  detail: (familyId: string, tripId: string) => ["trips", familyId, tripId] as const,
};
