import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ja: "日本語",
  vi: "Tiếng Việt",
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label>
      {t("common.language")}:{" "}
      <select
        value={i18n.language}
        onChange={(event) => {
          void i18n.changeLanguage(event.target.value as SupportedLanguage);
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
