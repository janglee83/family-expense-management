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

    const languageSelect = page.getByRole("combobox").first();
    await languageSelect.focus();
    await expect(languageSelect).toBeFocused();

    await expectNoHorizontalOverflow(page);
  });
});
