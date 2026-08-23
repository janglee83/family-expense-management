import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { LoginForm } from "./LoginForm";
import { useAuth } from "./useAuth";

vi.mock("./useAuth");

describe("LoginForm", () => {
  const loginMock = vi.fn();

  beforeEach(() => {
    loginMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: loginMock,
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("calls login with the entered credentials on submit", async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "correct-password");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(loginMock).toHaveBeenCalledWith("alice@example.com", "correct-password");
  });

  it("shows a translated error when login fails with invalid credentials", async () => {
    loginMock.mockRejectedValue(new Error("invalid_credentials"));
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスまたはパスワードが正しくありません",
    );
  });
});
