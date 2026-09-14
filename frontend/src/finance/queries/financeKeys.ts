export const financeKeys = {
  netWorth: (familyId: string, range: { startDate?: string; endDate?: string }) =>
    ["finance", familyId, "analytics", "net-worth", range.startDate ?? null, range.endDate ?? null] as const,
  accounts: (familyId: string) => ["finance", familyId, "accounts"] as const,
  goals: (familyId: string) => ["finance", familyId, "goals"] as const,
  goalEntries: (familyId: string, goalId: string) => ["finance", familyId, "goals", goalId, "entries"] as const,
};
