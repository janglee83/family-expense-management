import { expect, test } from "@playwright/test";
import { mockAuthLoggedOut } from "../fixtures/apiMocks";
import { expectNoHorizontalOverflow } from "../fixtures/uiAssertions";

test.describe("UI smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthLoggedOut(page);
  });

  test("opens the login page and renders the core shell", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();

    const submitButton = page.locator("main button[type='submit']").first();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    const languageButton = page.getByRole("button", { name: /言語|Ngôn ngữ|Language/i }).first();
    await languageButton.focus();
    await expect(languageButton).toBeFocused();

    await expectNoHorizontalOverflow(page);
  });
});
