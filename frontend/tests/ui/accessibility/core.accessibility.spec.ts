import { expect, test } from "@playwright/test";
import { mockAuthLoggedIn, mockAuthLoggedOut } from "../fixtures/apiMocks";
import { expectVisibleFocusStyle } from "../fixtures/uiAssertions";

test.describe("Accessibility and keyboard", () => {
  test("login form has semantic landmarks and accessible controls", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/login");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();

    const emailInput = page.getByLabel(/メールアドレス/);
    const passwordInput = page.getByLabel(/パスワード/);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("required", "");
  });

  test("keyboard-only tab sequence preserves visible focus", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/login");

    await page.keyboard.press("Tab");
    const languageField = page.locator('label[data-field="language"]');
    await expect(languageField).toBeVisible();
    await expectVisibleFocusStyle(languageField);

    await page.keyboard.press("Tab");
    const emailInput = page.getByLabel(/メールアドレス/);
    await expect(emailInput).toBeFocused();
    await expectVisibleFocusStyle(emailInput);

    await page.keyboard.press("Tab");
    const passwordInput = page.getByLabel(/パスワード/);
    await expect(passwordInput).toBeFocused();
    await expectVisibleFocusStyle(passwordInput);

    await page.keyboard.press("Tab");
    const submitButton = page.getByRole("button", { name: "ログイン" });
    await expect(submitButton).toBeFocused();
    await expectVisibleFocusStyle(submitButton);
  });

  test("language switch updates visible UI copy", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/login");

    const languageSelect = page.getByRole("combobox", { name: /言語/ });
    await languageSelect.selectOption("vi");

    await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
  });

  test("protected route redirects unauthenticated users to login", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/families");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();
  });

  test("home page exposes sidebar navigation landmarks", async ({ page }) => {
    await mockAuthLoggedIn(page);

    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "サイドバー" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ホーム" })).toBeVisible();
    await expect(page.getByRole("link", { name: "家族", exact: true })).toBeVisible();
  });
});
