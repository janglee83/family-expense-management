export interface CategoryIconOption {
  value: string;
  symbol: string;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { value: "basket", symbol: "🧺" },
  { value: "utensils", symbol: "🍽" },
  { value: "car", symbol: "🚗" },
  { value: "bolt", symbol: "⚡" },
  { value: "sparkles", symbol: "✨" },
  { value: "tag", symbol: "🏷" },
  { value: "health", symbol: "💊" },
  { value: "home", symbol: "🏠" },
  { value: "education", symbol: "📚" },
  { value: "gift", symbol: "🎁" },
];

const GLOBAL_ICON_BY_CATEGORY_NAME: Record<string, string> = {
  groceries: "basket",
  dining: "utensils",
  transport: "car",
  utilities: "bolt",
  entertainment: "sparkles",
  other: "tag",
};

const SYMBOL_BY_ICON_VALUE = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((item) => [item.value, item.symbol]),
);

export function resolveCategoryIconValue(
  icon: string | null | undefined,
  categoryName: string,
): string {
  return icon ?? GLOBAL_ICON_BY_CATEGORY_NAME[categoryName] ?? "tag";
}

export function resolveCategoryIconSymbol(
  icon: string | null | undefined,
  categoryName: string,
): string {
  const iconValue = resolveCategoryIconValue(icon, categoryName);
  return SYMBOL_BY_ICON_VALUE[iconValue] ?? "🏷";
}
