import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n/i18n";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";
import { createTestQueryClient } from "./testUtils/renderWithProviders";

const fetchCurrentUserMock = vi.fn();
const refreshSessionMock = vi.fn();

vi.mock("./auth/authApi", () => ({
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUserMock(...args),
  refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
}));

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SnackbarProvider>
          <AppRoutes />
        </SnackbarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppRoutes", () => {
  beforeEach(() => {
    fetchCurrentUserMock.mockReset();
    refreshSessionMock.mockReset();
    refreshSessionMock.mockResolvedValue(false);
  });

  it("redirects unauthenticated users from / to /login", async () => {
    fetchCurrentUserMock.mockResolvedValue(null);

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });

  it("renders the home page for authenticated users", async () => {
    fetchCurrentUserMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com",
      display_name: "Alice",
    });

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
  });

  it("renders the login page directly at /login", async () => {
    fetchCurrentUserMock.mockResolvedValue(null);

    renderAt("/login");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });

  it("re-establishes the session via refresh when the access token has expired", async () => {
    fetchCurrentUserMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        display_name: "Alice",
      });
    refreshSessionMock.mockResolvedValue(true);

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
    expect(refreshSessionMock).toHaveBeenCalled();
    expect(fetchCurrentUserMock).toHaveBeenCalledTimes(2);
  });

  it("does not get stuck loading when session establishment rejects at the network level", async () => {
    fetchCurrentUserMock.mockRejectedValue(new Error("network error"));

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });

  it("renders an isolated loading view for protected routes while auth state is pending", () => {
    fetchCurrentUserMock.mockImplementation(() => new Promise(() => {}));

    renderAt("/");

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByLabelText("サイドバー")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ガイドを再表示" })).not.toBeInTheDocument();
  });
});
