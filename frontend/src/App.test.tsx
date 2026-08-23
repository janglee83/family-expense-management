import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n/i18n";
import { AppRoutes } from "./AppRoutes";
import { AuthProvider } from "./auth/AuthContext";

const fetchCurrentUserMock = vi.fn();

vi.mock("./auth/authApi", () => ({
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUserMock(...args),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
}));

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppRoutes", () => {
  beforeEach(() => {
    fetchCurrentUserMock.mockReset();
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

    expect(await screen.findByRole("heading", { name: "家計簿" })).toBeInTheDocument();
  });

  it("renders the login page directly at /login", async () => {
    fetchCurrentUserMock.mockResolvedValue(null);

    renderAt("/login");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });
});
