import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CreateFamilyForm } from "../families/CreateFamilyForm";
import type { Family } from "../families/familyApi";
import { PageFrame, PageHeader } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { useSnackbar } from "../components/ui/Snackbar";

export function FamilyCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  function handleCreated(family: Family) {
    showSnackbar({ message: t("family.createSuccess"), variant: "success" });
    navigate(`/families/${family.id}`);
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("family.create")} description={t("family.createDescription")} />

        <section className="grid gap-6 lg:grid-cols-[1.65fr_1fr]" data-tour="family-create-page">
          <Card data-tour="family-create-form-card">
            <CardHeader>
              <CardTitle>{t("family.create")}</CardTitle>
              <CardDescription>{t("family.createDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateFamilyForm onCreated={handleCreated} />
            </CardContent>
          </Card>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("family.type")}</CardTitle>
                <CardDescription>{t("family.createDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
                  <p className="type-label">{t("family.typeShared")}</p>
                  <p className="type-body-sm">{t("family.addMember")}</p>
                </div>
                <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
                  <p className="type-label">{t("family.typeSolo")}</p>
                  <p className="type-body-sm">{t("family.savingsGoalRequiredForSolo")}</p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </PageFrame>
  );
}
