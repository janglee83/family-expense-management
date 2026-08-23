import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonJa from "./locales/ja/common.json";
import commonVi from "./locales/vi/common.json";

export const SUPPORTED_LANGUAGES = ["ja", "vi"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { common: commonJa },
      vi: { common: commonVi },
    },
    fallbackLng: "ja",
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: "common",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "family_expense_language",
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
