import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { RegisterForm } from "./RegisterForm";
import { useAuth } from "./useAuth";

vi.mock("./useAuth");

describe("RegisterForm", () => {
  const registerMock = vi.fn();

  beforeEach(() => {
    registerMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: registerMock,
      logout: vi.fn(),
    });
  });

  it("shows a validation error for a too-short password without calling the API", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("表示名"), "Alice");
    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "short");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "パスワードは8文字以上で入力してください",
    );
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("calls register with the entered values when password is long enough", async () => {
    registerMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("表示名"), "Alice");
    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "correct-password");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(registerMock).toHaveBeenCalledWith(
      "alice@example.com",
      "correct-password",
      "Alice",
    );
  });
});
