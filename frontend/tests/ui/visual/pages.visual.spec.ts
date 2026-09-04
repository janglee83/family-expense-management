import { expect, test } from "@playwright/test";
import {
  mockAuthLoggedIn,
  mockAuthLoggedOut,
  mockFamiliesCollection,
  mockHomeDashboardData,
} from "../fixtures/apiMocks";
import { TEST_FAMILY } from "../fixtures/testData";

test.describe("Visual regression", () => {
  test("login page baseline", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/login");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page).toHaveScreenshot("auth-login.png", { fullPage: true });
  });

  test("register page baseline in light mode", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/register");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page).toHaveScreenshot("auth-register-light.png", { fullPage: true });
  });

  test("register page baseline in dark mode", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/register");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await expect(page).toHaveScreenshot("auth-register-dark.png", { fullPage: true });
  });

  test("home dashboard baseline", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockHomeDashboardData(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
    await expect(page).toHaveScreenshot("home-dashboard.png", { fullPage: true });
  });

  test("families empty-state baseline", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, []);

    await page.goto("/families");
    await expect(page.getByRole("heading", { level: 1, name: "自分の家族" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("まだ家族がありません");
    await expect(page).toHaveScreenshot("families-empty.png", { fullPage: true });
  });

  test("family create page baseline", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, []);

    await page.goto("/families/new");
    await expect(page.getByRole("heading", { level: 1, name: "作成" })).toBeVisible();
    await expect(page).toHaveScreenshot("family-create.png", { fullPage: true });
  });

  test("family detail baseline", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, [TEST_FAMILY]);

    await page.route(new RegExp(`/api/v1/families/${TEST_FAMILY.id}(?:\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: TEST_FAMILY.id,
          name: TEST_FAMILY.name,
          family_type: TEST_FAMILY.family_type,
          monthly_income: TEST_FAMILY.monthly_income,
          members: [
            {
              user_id: "11111111-1111-1111-1111-111111111111",
              email: "playwright.qa@example.com",
              display_name: "Playwright QA",
              role: "owner",
            },
          ],
        }),
      });
    });

    await page.goto(`/families/${TEST_FAMILY.id}`);
    await expect(page.getByRole("heading", { name: TEST_FAMILY.name })).toBeVisible();
    await expect(page).toHaveScreenshot("family-detail.png", { fullPage: true });
  });
});
