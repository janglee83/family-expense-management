import { expect, test } from "@playwright/test";
import {
  mockAuthLoggedIn,
  mockAuthLoggedOut,
  mockExpensesPageData,
  mockFamiliesCollection,
  mockFamilyDetail,
  mockHomeDashboardData,
  mockReceiptsPageData,
} from "../fixtures/apiMocks";
import { TEST_FAMILY, TEST_USER } from "../fixtures/testData";

test.describe("UI states", () => {
  test("protected route shows loading state before auth resolves", async ({ page }) => {
    let releaseAuth: (() => void) | null = null;
    const authGate = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });

    await page.route(/\/api\/v1\/auth\/me(?:\?.*)?$/, async (route) => {
      await authGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TEST_USER),
      });
    });
    await page.route(/\/api\/v1\/auth\/refresh(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await mockHomeDashboardData(page);

    const navigation = page.goto("/");
    await expect(page.getByText("Loading...")).toBeVisible();

    if (!releaseAuth) {
      throw new Error("Auth gate was not initialized");
    }
    releaseAuth();

    await navigation;
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  });

  test("home page displays user summary state", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockHomeDashboardData(page);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  });

  test("family list displays empty state clearly", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, []);

    await page.goto("/families");

    await expect(page.getByRole("main")).toContainText("まだ家族がありません");
  });

  test("family detail surfaces error state when data cannot load", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamilyDetail(page, TEST_FAMILY.id, { detail: "not found" }, 404);

    await page.goto(`/families/${TEST_FAMILY.id}`);

    await expect(page.getByRole("alert")).toContainText("エラーが発生しました。もう一度お試しください");
  });

  test("expense page shows empty state when no expenses are available", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockExpensesPageData(page, { familyId: TEST_FAMILY.id, expenses: [] });

    await page.goto(`/families/${TEST_FAMILY.id}/expenses`);

    await expect(page.getByRole("main")).toContainText("まだ支出がありません");
  });

  test("receipt page shows empty state when no receipts are available", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockReceiptsPageData(page, { familyId: TEST_FAMILY.id, receipts: [] });

    await page.goto(`/families/${TEST_FAMILY.id}/receipts`);

    await expect(page.getByRole("main")).toContainText("まだレシートがありません");
  });

  test("unauthenticated access to protected home redirects to login state", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();
  });
});
