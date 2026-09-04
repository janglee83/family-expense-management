import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, expectVisibleFocusStyle } from "../fixtures/uiAssertions";

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

test.describe("Real backend UI audit", () => {
  test.setTimeout(180_000);

  test("audits all important routes with real database-backed data", async ({ page, request }, testInfo) => {
    const backendHealth = await request.get("http://localhost:8000/api/v1/ping");
    expect(backendHealth.ok()).toBeTruthy();

    const consoleErrors: string[] = [];
    const api5xxErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("response", (response) => {
      if (!response.url().includes("/api/v1/")) {
        return;
      }
      if (response.status() >= 500) {
        api5xxErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    const suffix = `${Date.now()}-${testInfo.parallelIndex}`;
    const email = `pw.real.${suffix}@example.com`;
    const displayName = `PW Real ${suffix}`;
    const password = "Password123!";
    const familyName = `PW Family ${suffix}`;

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "ログイン" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const emailInput = page.getByLabel(/メールアドレス/);
    const passwordInput = page.getByLabel(/パスワード/);
    await expect(emailInput).toHaveAttribute("required", "");
    await expect(passwordInput).toHaveAttribute("required", "");

    await page.keyboard.press("Tab");
    const languageSwitcher = page.getByRole("combobox", { name: /言語/ });
    await expect(languageSwitcher).toBeFocused();
    await expectVisibleFocusStyle(languageSwitcher);

    await page.goto("/register");
    await expect(page.getByRole("heading", { level: 1, name: "アカウント作成" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByLabel(/表示名/).fill(displayName);
    await page.getByLabel(/メールアドレス/).fill(email);
    await page.getByLabel(/パスワード/).fill(password);
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "ダッシュボード" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/families/new");
    await expect(page.getByRole("heading", { level: 1, name: "作成" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByLabel(/家族名/).fill(familyName);
    await page.getByRole("button", { name: "作成", exact: true }).click();

    await expect(page).toHaveURL(/\/families\/[0-9a-f-]+$/i);
    const familyUrlMatch = page.url().match(/\/families\/([0-9a-f-]+)$/i);
    expect(familyUrlMatch).not.toBeNull();
    const familyId = familyUrlMatch![1];

    await expect(page.getByRole("heading", { level: 1, name: familyName })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: "支出一覧" }).click();
    await expect(page).toHaveURL(new RegExp(`/families/${familyId}/expenses$`));
    await expect(page.getByRole("heading", { level: 1, name: "支出一覧" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "追加", exact: true }).first().click();
    const expenseForm = page.locator("form").first();
    await expenseForm.getByLabel(/金額/).fill("1234");
    await expenseForm.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText(/1,234/)).toBeVisible();

    await page.goto(`/families/${familyId}/receipts`);
    await expect(page.getByRole("heading", { level: 1, name: "レシート一覧" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const uploadButton = page.getByRole("button", { name: "アップロード", exact: true });
    await expect(uploadButton).toBeDisabled();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not-an-image"),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "JPEG、PNG、HEIC形式のみアップロードできます" }),
    ).toBeVisible();

    await fileInput.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p6ioAAAAASUVORK5CYII=",
        "base64",
      ),
    });

    await expect(uploadButton).toBeEnabled();
    await uploadButton.click();
    await expect(page.locator("li[data-status]").first()).toBeVisible();

    const authenticatedRoutes = [
      "/",
      "/families",
      "/families/new",
      `/families/${familyId}`,
      `/families/${familyId}/expenses`,
      `/families/${familyId}/receipts`,
    ];

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const route of authenticatedRoutes) {
        await page.goto(route);
        await expect(page.getByRole("main")).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }

    const unexpectedConsoleErrors = consoleErrors.filter(
      (message) => !/status of 401 \(Unauthorized\)/.test(message),
    );

    expect(api5xxErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
