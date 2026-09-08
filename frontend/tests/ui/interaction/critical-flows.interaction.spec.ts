import { expect, test } from "@playwright/test";
import {
  mockAuthLoggedIn,
  mockAuthLoggedOut,
  mockExpensesPageData,
  mockFamiliesCollection,
  mockFamilyDetail,
  mockLoginFailure,
  mockReceiptsPageData,
} from "../fixtures/apiMocks";
import { TEST_FAMILY } from "../fixtures/testData";

test.describe("Critical interaction flows", () => {
  test("login shows invalid-credentials error and recovers submit state", async ({ page }) => {
    await mockAuthLoggedOut(page);
    await mockLoginFailure(page, 401);

    await page.goto("/login");

    await page.getByLabel(/メールアドレス/).fill("qa@example.com");
    await page.getByLabel(/パスワード/).fill("wrong-password");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "メールアドレスまたはパスワードが正しくありません",
    );
    await expect(page.getByRole("button", { name: "ログイン" })).toBeEnabled();
  });

  test("register enforces minimum password length", async ({ page }) => {
    await mockAuthLoggedOut(page);

    await page.goto("/register");

    await page.getByLabel(/表示名/).fill("QA User");
    await page.getByLabel(/メールアドレス/).fill("qa@example.com");
    await page.getByLabel(/パスワード/).fill("short");
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByRole("alert")).toContainText("パスワードは8文字以上で入力してください");
  });

  test("family creation navigates to the detail page", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockFamiliesCollection(page, [], TEST_FAMILY);
    await mockFamilyDetail(page, TEST_FAMILY.id);

    await page.goto("/families/new");

    await page.getByLabel(/家族名/).fill(TEST_FAMILY.name);
    await page.getByRole("button", { name: "作成" }).click();

    await expect(page).toHaveURL(new RegExp(`/families/${TEST_FAMILY.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: TEST_FAMILY.name })).toBeVisible();
  });

  test("expense form blocks non-positive amount", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockExpensesPageData(page, { familyId: TEST_FAMILY.id, expenses: [] });

    await page.goto(`/families/${TEST_FAMILY.id}/expenses`);

    await page.getByRole("button", { name: "追加" }).first().click();

    const expenseForm = page.locator("form").first();
    await expenseForm.getByLabel(/金額/).fill("0");
    await expenseForm.getByRole("button", { name: "支出を追加", exact: true }).click();

    await expect(page.getByRole("alert")).toContainText("金額は1円以上で入力してください");
  });

  test("receipt upload validates file type before submit", async ({ page }) => {
    await mockAuthLoggedIn(page);
    await mockReceiptsPageData(page, { familyId: TEST_FAMILY.id, receipts: [] });

    await page.goto(`/families/${TEST_FAMILY.id}/receipts`);

    const uploadButton = page.getByRole("button", {
      name: "レシートをアップロード",
      exact: true,
    });
    await expect(uploadButton).toBeDisabled();

    await page.getByLabel(/アップロード/).setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not-an-image"),
    });

    await expect(page.getByRole("alert")).toContainText("JPEG、PNG、HEIC形式のみアップロードできます");
    await expect(uploadButton).toBeDisabled();
  });
});
