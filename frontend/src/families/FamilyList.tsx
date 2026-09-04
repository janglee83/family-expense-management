import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listMyFamilies, type Family } from "./familyApi";
import { PageFrame, PageHeader, EmptyState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { buttonClassName } from "../components/ui/buttonClassName";

export function FamilyList() {
  const { t } = useTranslation();
  const [families, setFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyFamilies()
      .then((result) => {
        if (!cancelled) {
          setFamilies(result);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFamilies([]);
          setError(t("family.actionFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={t("family.myFamilies")}
          description={t("app.title")}
          actions={
            <Link to="/families/new" data-tour="family-create-action" className={buttonClassName({ className: "no-underline" })}>
              {t("family.create")}
            </Link>
          }
        />

        <section className="grid gap-6 xl:grid-cols-[1.75fr_1fr]" data-tour="family-list-panel">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t("family.myFamilies")}</CardTitle>
              <CardDescription>{t("family.noFamilies")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <Alert variant="error" role="alert">
                  {error}
                </Alert>
              ) : null}

              {isLoading ? (
                <p className="type-body-sm">{t("common.loading")}</p>
              ) : !error && families.length === 0 ? (
                <EmptyState title={t("family.noFamilies")} />
              ) : (
                <ul className="space-y-3">
                  {families.map((family) => (
                    <li key={family.id}>
                      <Link
                        to={`/families/${family.id}`}
                        className="interactive-row group flex items-center justify-between gap-3 no-underline"
                      >
                        <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                          {family.name}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge variant="neutral">{t(`role.${family.role}`)}</Badge>
                          <span aria-hidden="true" className="text-muted-foreground">
                            &gt;
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <aside className="space-y-6" aria-label={t("nav.sidebarLabel")}>
            <Card>
              <CardHeader>
                <CardTitle>{t("family.myFamilies")}</CardTitle>
                <CardDescription>{t("family.createDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border/80 bg-muted/40 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("family.myFamilies")}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
                    {isLoading ? "-" : families.length}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{t("family.typeShared")}</Badge>
                  <Badge variant="neutral">{t("family.typeSolo")}</Badge>
                </div>
                <Link
                  to="/families/new"
                  className={buttonClassName({ className: "w-full justify-center no-underline" })}
                >
                  {t("family.create")}
                </Link>
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </PageFrame>
  );
}
