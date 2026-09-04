import type { Page, Route } from "@playwright/test";
import {
  TEST_CATEGORIES,
  TEST_EXPENSES,
  TEST_FAMILY,
  TEST_FAMILY_DETAIL,
  TEST_RECEIPTS,
  TEST_USER,
} from "./testData";

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

export async function mockAuthLoggedOut(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/auth\/me(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 401, { detail: "Unauthorized" });
  });
  await page.route(/\/api\/v1\/auth\/refresh(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 401, { detail: "Unauthorized" });
  });
  await page.route(/\/api\/v1\/auth\/logout(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
}

export async function mockAuthLoggedIn(
  page: Page,
  user: typeof TEST_USER = TEST_USER,
): Promise<void> {
  await page.route(/\/api\/v1\/auth\/me(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 200, user);
  });
  await page.route(/\/api\/v1\/auth\/refresh(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 200, { ok: true });
  });
  await page.route(/\/api\/v1\/auth\/logout(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route(/\/api\/v1\/notifications\/(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 200, []);
  });
  await page.route(/\/api\/v1\/notifications\/read-all(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route(/\/api\/v1\/notifications\/[^/]+\/read(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, 200, {
      id: "00000000-0000-0000-0000-000000000000",
      user_id: user.id,
      family_id: null,
      actor_user_id: null,
      message: "read",
      read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  });
}

export async function mockLoginFailure(page: Page, status: 401 | 429 = 401): Promise<void> {
  await page.route(/\/api\/v1\/auth\/login(?:\?.*)?$/, async (route) => {
    await fulfillJson(route, status, { detail: "auth_failed" });
  });
}

export async function mockPing(page: Page, variant: "success" | "failure" = "success"): Promise<void> {
  await page.route(/\/api\/v1\/ping(?:\?.*)?$/, async (route) => {
    if (variant === "success") {
      await fulfillJson(route, 200, { status: "ok", message: "pong" });
      return;
    }
    await fulfillJson(route, 500, { detail: "ping_failed" });
  });
}

export async function mockFamiliesCollection(
  page: Page,
  families: Array<unknown> = [],
  createdFamily: unknown | null = null,
): Promise<void> {
  await page.route(/\/api\/v1\/families\/(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await fulfillJson(route, 200, families);
      return;
    }
    if (method === "POST" && createdFamily) {
      await fulfillJson(route, 201, createdFamily);
      return;
    }
    await route.fulfill({ status: 405, body: "" });
  });
}

export async function mockHomeDashboardData(
  page: Page,
  options?: {
    family?: typeof TEST_FAMILY;
    categories?: Array<unknown>;
    expenses?: Array<unknown>;
  },
): Promise<void> {
  const family = options?.family ?? TEST_FAMILY;
  const categories = options?.categories ?? TEST_CATEGORIES;
  const expenses = options?.expenses ?? TEST_EXPENSES;

  await mockFamiliesCollection(page, [family]);

  const categoriesPattern = new RegExp(
    `/api/v1/families/${escapeRegExp(family.id)}/categories/(?:\\?.*)?$`,
  );
  await page.route(categoriesPattern, async (route) => {
    await fulfillJson(route, 200, categories);
  });

  const expensesPattern = new RegExp(
    `/api/v1/families/${escapeRegExp(family.id)}/expenses/(?:\\?.*)?$`,
  );
  await page.route(expensesPattern, async (route) => {
    await fulfillJson(route, 200, expenses);
  });
}

export async function mockFamilyDetail(
  page: Page,
  familyId: string = TEST_FAMILY.id,
  detail: unknown = TEST_FAMILY_DETAIL,
  status = 200,
): Promise<void> {
  const pattern = new RegExp(`/api/v1/families/${escapeRegExp(familyId)}(?:\\?.*)?$`);
  await page.route(pattern, async (route) => {
    if (status >= 200 && status < 300) {
      await fulfillJson(route, status, detail);
      return;
    }
    await fulfillJson(route, status, { detail: "family_failed" });
  });
}

export async function mockExpensesPageData(
  page: Page,
  options?: {
    familyId?: string;
    familyDetail?: unknown;
    categories?: Array<unknown>;
    expenses?: Array<unknown>;
  },
): Promise<void> {
  const familyId = options?.familyId ?? TEST_FAMILY.id;
  const familyDetail = options?.familyDetail ?? TEST_FAMILY_DETAIL;
  const categories = options?.categories ?? TEST_CATEGORIES;
  const expenses = options?.expenses ?? TEST_EXPENSES;

  await mockFamilyDetail(page, familyId, familyDetail);

  const categoriesPattern = new RegExp(
    `/api/v1/families/${escapeRegExp(familyId)}/categories/(?:\\?.*)?$`,
  );
  await page.route(categoriesPattern, async (route) => {
    await fulfillJson(route, 200, categories);
  });

  const expensesPattern = new RegExp(
    `/api/v1/families/${escapeRegExp(familyId)}/expenses/(?:\\?.*)?$`,
  );
  await page.route(expensesPattern, async (route) => {
    await fulfillJson(route, 200, expenses);
  });
}

export async function mockReceiptsPageData(
  page: Page,
  options?: {
    familyId?: string;
    familyDetail?: unknown;
    receipts?: Array<unknown>;
  },
): Promise<void> {
  const familyId = options?.familyId ?? TEST_FAMILY.id;
  const familyDetail = options?.familyDetail ?? TEST_FAMILY_DETAIL;
  const receipts = options?.receipts ?? TEST_RECEIPTS;

  await mockFamilyDetail(page, familyId, familyDetail);

  const receiptsPattern = new RegExp(
    `/api/v1/families/${escapeRegExp(familyId)}/receipts/(?:\\?.*)?$`,
  );
  await page.route(receiptsPattern, async (route) => {
    await fulfillJson(route, 200, receipts);
  });
}
