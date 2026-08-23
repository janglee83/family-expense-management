import { useTranslation } from "react-i18next";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.register")}</h1>
    </main>
  );
}
