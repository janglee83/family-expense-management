import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { getFamilyDetail, type FamilyDetail as FamilyDetailType } from "./familyApi";

export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const [detail, setDetail] = useState<FamilyDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    getFamilyDetail(familyId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }
  if (!detail) {
    return <p role="alert">{t("family.actionFailed")}</p>;
  }

  return (
    <main>
      <h1>{detail.name}</h1>
      <ul>
        {detail.members.map((member) => (
          <li key={member.user_id}>
            {member.display_name} ({t(`role.${member.role}`)})
          </li>
        ))}
      </ul>
    </main>
  );
}
