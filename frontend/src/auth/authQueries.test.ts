import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { authKeys, useCurrentUser, useLogin, useLogout, useRegister } from "./authQueries";
import * as authApi from "./authApi";

vi.mock("./authApi");

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the user fetched from fetchCurrentUser", async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue({
      id: "u1",
      email: "a@example.com",
      display_name: "Alice",
    });

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("u1"));
  });

  it("falls back to refreshSession then refetches when fetchCurrentUser first returns null", async () => {
    vi.mocked(authApi.fetchCurrentUser)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u1", email: "a@example.com", display_name: "Alice" });
    vi.mocked(authApi.refreshSession).mockResolvedValue(true);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("u1"));
    expect(authApi.refreshSession).toHaveBeenCalled();
  });

  it("resolves to null instead of throwing when fetchCurrentUser rejects at the network level", async () => {
    vi.mocked(authApi.fetchCurrentUser).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });
});

describe("useLogin", () => {
  it("seeds authKeys.currentUser with the logged-in user on success", async () => {
    vi.mocked(authApi.loginUser).mockResolvedValue({ id: "u1", email: "a@example.com", display_name: "Alice" });
    const wrapper = createQueryWrapper();
    const { result: loginResult } = renderHook(() => useLogin(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await loginResult.current.mutateAsync({ email: "a@example.com", password: "secret123" });
    });

    await waitFor(() => expect(currentUserResult.current.data?.id).toBe("u1"));
  });
});

describe("useRegister", () => {
  it("seeds authKeys.currentUser with the registered user on success", async () => {
    vi.mocked(authApi.registerUser).mockResolvedValue({ id: "u2", email: "b@example.com", display_name: "Bob" });
    const wrapper = createQueryWrapper();
    const { result: registerResult } = renderHook(() => useRegister(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await registerResult.current.mutateAsync({ email: "b@example.com", password: "secret123", displayName: "Bob" });
    });

    await waitFor(() => expect(currentUserResult.current.data?.id).toBe("u2"));
  });
});

describe("useLogout", () => {
  it("clears authKeys.currentUser to null on success", async () => {
    vi.mocked(authApi.logoutUser).mockResolvedValue(undefined);
    const wrapper = createQueryWrapper();
    const { result: logoutResult } = renderHook(() => useLogout(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await logoutResult.current.mutateAsync();
    });

    await waitFor(() => expect(currentUserResult.current.data).toBeNull());
  });
});

describe("authKeys", () => {
  it("has a stable currentUser key", () => {
    expect(authKeys.currentUser).toEqual(["auth", "me"]);
  });
});
