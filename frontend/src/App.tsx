import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export default function App() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <LanguageSwitcher />
    </main>
  );
}
