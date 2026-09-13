import { useQuery } from "@tanstack/react-query";
import { renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createQueryWrapper, renderWithProviders } from "./renderWithProviders";

function Probe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: async () => "ok" });
  return <p>{data ?? "loading"}</p>;
}

describe("renderWithProviders", () => {
  it("renders children under a QueryClientProvider", async () => {
    renderWithProviders(<Probe />);
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });
});

describe("createQueryWrapper", () => {
  it("wraps renderHook so useQuery works without throwing", async () => {
    const { result } = renderHook(() => useQuery({ queryKey: ["probe-2"], queryFn: async () => "hook-ok" }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe("hook-ok"));
  });
});
