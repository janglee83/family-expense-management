export const financeKeys = {
  netWorth: (familyId: string, range: { startDate?: string; endDate?: string }) =>
    ["finance", familyId, "analytics", "net-worth", range.startDate ?? null, range.endDate ?? null] as const,
};
