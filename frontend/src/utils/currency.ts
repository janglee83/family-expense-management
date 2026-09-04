export type CurrencyCode = "vnd" | "jpy";

const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; currency: string; zeroSymbol: string }> = {
  jpy: {
    locale: "ja-JP",
    currency: "JPY",
    zeroSymbol: "\u00a50",
  },
  vnd: {
    locale: "vi-VN",
    currency: "VND",
    zeroSymbol: "0\u00a0\u20ab",
  },
};

const numberFormatterCache = new Map<CurrencyCode, Intl.NumberFormat>();
const currencyFormatterCache = new Map<CurrencyCode, Intl.NumberFormat>();
const compactFormatterCache = new Map<CurrencyCode, Intl.NumberFormat>();

function resolveCurrencyCode(currencyCode: string | null | undefined): CurrencyCode {
  return currencyCode === "vnd" ? "vnd" : "jpy";
}

function getNumberFormatter(currencyCode: CurrencyCode): Intl.NumberFormat {
  const cached = numberFormatterCache.get(currencyCode);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(CURRENCY_CONFIG[currencyCode].locale, {
    maximumFractionDigits: 0,
  });
  numberFormatterCache.set(currencyCode, formatter);
  return formatter;
}

function getCurrencyFormatter(currencyCode: CurrencyCode): Intl.NumberFormat {
  const cached = currencyFormatterCache.get(currencyCode);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(CURRENCY_CONFIG[currencyCode].locale, {
    style: "currency",
    currency: CURRENCY_CONFIG[currencyCode].currency,
    maximumFractionDigits: 0,
  });
  currencyFormatterCache.set(currencyCode, formatter);
  return formatter;
}

function getCompactFormatter(currencyCode: CurrencyCode): Intl.NumberFormat {
  const cached = compactFormatterCache.get(currencyCode);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(CURRENCY_CONFIG[currencyCode].locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  compactFormatterCache.set(currencyCode, formatter);
  return formatter;
}

export function currencyLocale(currencyCode: string | null | undefined): string {
  return CURRENCY_CONFIG[resolveCurrencyCode(currencyCode)].locale;
}

export function formatMoney(
  value: number,
  currencyCode: string | null | undefined,
  withSymbol = true,
): string {
  const normalizedCurrency = resolveCurrencyCode(currencyCode);
  if (!Number.isFinite(value)) {
    return withSymbol ? CURRENCY_CONFIG[normalizedCurrency].zeroSymbol : "0";
  }

  return withSymbol
    ? getCurrencyFormatter(normalizedCurrency).format(value)
    : getNumberFormatter(normalizedCurrency).format(value);
}

export function formatMoneyCompact(value: number, currencyCode: string | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return getCompactFormatter(resolveCurrencyCode(currencyCode)).format(value);
}

export function formatYen(value: number, withSymbol = true): string {
  return formatMoney(value, "jpy", withSymbol);
}
