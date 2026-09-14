import { useQuery } from "@tanstack/react-query";
import { getNetWorth } from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useNetWorth(familyId: string, range: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: financeKeys.netWorth(familyId, range),
    queryFn: () => getNetWorth(familyId, range),
    enabled: Boolean(familyId),
  });
}
