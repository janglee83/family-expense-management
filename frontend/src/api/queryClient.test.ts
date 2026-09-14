import { describe, expect, it } from "vitest";
import { queryClient } from "./queryClient";

describe("queryClient", () => {
  it("uses a long staleTime, a long gcTime, and disables refetch-on-focus for queries", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
    expect(defaults.queries?.gcTime).toBe(30 * 60 * 1000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(1);
  });

  it("disables retry for mutations", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(0);
  });
});
