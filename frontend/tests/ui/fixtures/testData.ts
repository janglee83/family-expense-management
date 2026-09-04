export const TEST_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "playwright.qa@example.com",
  display_name: "Playwright QA",
};

export const TEST_FAMILY = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "Playwright Household",
  role: "owner",
  family_type: "shared",
  monthly_income: null,
};

export const TEST_FAMILY_DETAIL = {
  id: TEST_FAMILY.id,
  name: TEST_FAMILY.name,
  family_type: TEST_FAMILY.family_type,
  monthly_income: TEST_FAMILY.monthly_income,
  members: [
    {
      user_id: TEST_USER.id,
      email: TEST_USER.email,
      display_name: TEST_USER.display_name,
      role: "owner",
    },
    {
      user_id: "22222222-2222-2222-2222-222222222222",
      email: "member@example.com",
      display_name: "Member Person",
      role: "member",
    },
  ],
};

export const TEST_CATEGORIES = [
  { id: "cat-groceries", family_id: null, name: "groceries", icon: "basket" },
  { id: "cat-custom", family_id: TEST_FAMILY.id, name: "Household", icon: "home" },
];

export const TEST_EXPENSES = [
  {
    id: "exp-1",
    family_id: TEST_FAMILY.id,
    payer_user_id: TEST_USER.id,
    created_by_user_id: TEST_USER.id,
    category_id: "cat-groceries",
    amount: 2400,
    is_shared: true,
    description: "Weekly groceries",
    expense_date: "2026-09-01",
  },
];

export const TEST_RECEIPTS = [
  {
    id: "rec-1",
    family_id: TEST_FAMILY.id,
    uploaded_by_user_id: TEST_USER.id,
    status: "processing",
    file_name: "receipt.png",
    mime_type: "image/png",
    file_size: 1024,
    created_at: "2026-09-01T00:00:00Z",
  },
];
