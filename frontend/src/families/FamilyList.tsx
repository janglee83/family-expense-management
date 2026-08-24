import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { listMyFamilies, type Family } from "./familyApi";
import { CreateFamilyForm } from "./CreateFamilyForm";

export function FamilyList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [families, setFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listMyFamilies()
      .then((result) => {
        if (!cancelled) setFamilies(result);
      })
      .catch(() => {
        if (!cancelled) setFamilies([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(family: Family) {
    navigate(`/families/${family.id}`);
  }

  return (
    <main>
      <h1>{t("family.myFamilies")}</h1>
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : families.length === 0 ? (
        <p>{t("family.noFamilies")}</p>
      ) : (
        <ul>
          {families.map((family) => (
            <li key={family.id}>
              <Link to={`/families/${family.id}`}>{family.name}</Link> (
              {t(`role.${family.role}`)})
            </li>
          ))}
        </ul>
      )}
      <CreateFamilyForm onCreated={handleCreated} />
    </main>
  );
}
