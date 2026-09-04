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
import { expectNoHorizontalOverflow } from "../fixtures/uiAssertions";
import { TEST_FAMILY } from "../fixtures/testData";

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function assertResponsiveIntegrity(page: Parameters<typeof test>[0]["page"], route: string) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
}

test.describe("Responsive layout quality", () => {
  test("login page holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedOut(page);
    await assertResponsiveIntegrity(page, "/login");
  });

  test("register page holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedOut(page);
    await assertResponsiveIntegrity(page, "/register");
  });

  test("home page holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockHomeDashboardData(page);
    await assertResponsiveIntegrity(page, "/");
  });

  test("family list holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, []);
    await assertResponsiveIntegrity(page, "/families");
  });

  test("family detail holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamilyDetail(page, TEST_FAMILY.id);
    await assertResponsiveIntegrity(page, `/families/${TEST_FAMILY.id}`);
  });

  test("expense list holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockExpensesPageData(page, { familyId: TEST_FAMILY.id, expenses: [] });
    await assertResponsiveIntegrity(page, `/families/${TEST_FAMILY.id}/expenses`);
  });

  test("receipt list holds layout across viewport matrix", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockReceiptsPageData(page, { familyId: TEST_FAMILY.id, receipts: [] });
    await assertResponsiveIntegrity(page, `/families/${TEST_FAMILY.id}/receipts`);
  });
});
