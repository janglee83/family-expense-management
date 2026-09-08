import { expect, test, type Page, type Route } from "@playwright/test";
import { mockAuthLoggedIn } from "../fixtures/apiMocks";
import { TEST_CATEGORIES, TEST_FAMILY, TEST_FAMILY_DETAIL } from "../fixtures/testData";
import { expectNoHorizontalOverflow } from "../fixtures/uiAssertions";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockFinanceSmokeData(page: Page): Promise<void> {
  const familyId = TEST_FAMILY.id;
  const family = {
    ...TEST_FAMILY,
    currency_code: "jpy" as const,
    monthly_income_enabled: true,
    monthly_income: 300000,
    savings_goal_amount: 50000,
  };
  const familyDetail = {
    ...TEST_FAMILY_DETAIL,
    currency_code: "jpy",
    monthly_income_enabled: true,
    monthly_income: 300000,
    savings_goal_amount: 50000,
  };

  await page.route(/\/api\/v1\/families\/(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, body: "" });
      return;
    }

    await fulfillJson(route, 200, [family]);
  });

  const familyDetailPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}(?:\\?.*)?$`);
  await page.route(familyDetailPattern, async (route) => {
    await fulfillJson(route, 200, familyDetail);
  });

  const categoriesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/categories/(?:\\?.*)?$`);
  await page.route(categoriesPattern, async (route) => {
    await fulfillJson(route, 200, TEST_CATEGORIES);
  });

  const expensesPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/expenses/(?:\\?.*)?$`);
  await page.route(expensesPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });

  const accountsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/accounts/(?:\\?.*)?$`);
  await page.route(accountsPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });

  const ledgerPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/ledger-transactions/(?:\\?.*)?$`);
  await page.route(ledgerPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });

  const goalsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/goals/(?:\\?.*)?$`);
  await page.route(goalsPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });

  const subscriptionsPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/subscriptions/(?:\\?.*)?$`);
  await page.route(subscriptionsPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });

  const subscriptionSummaryPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/subscriptions/summary(?:\\?.*)?$`);
  await page.route(subscriptionSummaryPattern, async (route) => {
    await fulfillJson(route, 200, {
      monthly_total: 0,
      yearly_total: 0,
      upcoming_subscription_ids: [],
    });
  });

  const splitPattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}/split-expenses/(?:\\?.*)?$`);
  await page.route(splitPattern, async (route) => {
    await fulfillJson(route, 200, []);
  });
}

async function expectFinanceNavJapanese(page: Page, activeLabel: string): Promise<void> {
  const financeNav = page.getByRole("navigation", { name: "家計セクション" });
  await expect(financeNav).toBeVisible();

  await expect(financeNav.getByRole("link", { name: "口座と台帳" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "目標" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "サブスクリプション" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "割り勘" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "データ操作" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "家族へ戻る" })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: activeLabel })).toHaveAttribute("aria-current", "page");
}

test.describe("Finance pages smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFinanceSmokeData(page);
  });

  test("accounts page renders Japanese labels and empty account state", async ({ page }) => {
    await page.goto(`/families/${TEST_FAMILY.id}/finance/accounts`);

    await expect(page.getByRole("heading", { level: 1, name: "口座と台帳" })).toBeVisible();
    await expectFinanceNavJapanese(page, "口座と台帳");
    await expect(page.getByRole("main")).toContainText("口座を作成");
    await expect(page.getByRole("main")).toContainText("台帳エントリーを追加");
    await expect(page.getByRole("main")).toContainText("口座がまだありません");
    await expectNoHorizontalOverflow(page);
  });

  test("goals page renders Japanese labels and empty goals state", async ({ page }) => {
    await page.goto(`/families/${TEST_FAMILY.id}/finance/goals`);

    await expect(page.getByRole("heading", { level: 1, name: "目標" })).toBeVisible();
    await expectFinanceNavJapanese(page, "目標");
    await expect(page.getByRole("main")).toContainText("目標を作成");
    await expect(page.getByRole("main")).toContainText("目標一覧");
    await expect(page.getByRole("main")).toContainText("目標がまだありません");
    await expectNoHorizontalOverflow(page);
  });

  test("subscriptions page renders Japanese labels and empty subscriptions state", async ({ page }) => {
    await page.goto(`/families/${TEST_FAMILY.id}/finance/subscriptions`);

    await expect(page.getByRole("heading", { level: 1, name: "サブスクリプション" })).toBeVisible();
    await expectFinanceNavJapanese(page, "サブスクリプション");
    await expect(page.getByRole("main")).toContainText("サブスクを作成");
    await expect(page.getByRole("main")).toContainText("サブスク一覧");
    await expect(page.getByRole("main")).toContainText("サブスクがまだありません");
    await expectNoHorizontalOverflow(page);
  });

  test("splits page renders Japanese labels and empty splits state", async ({ page }) => {
    await page.goto(`/families/${TEST_FAMILY.id}/finance/splits`);

    await expect(page.getByRole("heading", { level: 1, name: "割り勘" })).toBeVisible();
    await expectFinanceNavJapanese(page, "割り勘");
    await expect(page.getByRole("main")).toContainText("割り勘を作成");
    await expect(page.getByRole("main")).toContainText("割り勘一覧");
    await expect(page.getByRole("main")).toContainText("割り勘データがまだありません");
    await expectNoHorizontalOverflow(page);
  });

  test("data ops page renders Japanese labels and empty undo list state", async ({ page }) => {
    await page.goto(`/families/${TEST_FAMILY.id}/finance/data`);

    await expect(page.getByRole("heading", { level: 1, name: "データ操作" })).toBeVisible();
    await expectFinanceNavJapanese(page, "データ操作");
    await expect(page.getByRole("main")).toContainText("エクスポート");
    await expect(page.getByRole("main")).toContainText("CSV取り込み");
    await expect(page.getByRole("main")).toContainText("取り消し可能な削除");
    await expect(page.getByRole("main")).toContainText("まだ支出がありません");
    await expectNoHorizontalOverflow(page);
  });
});
