import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  changeMemberRole,
  deleteFamily,
  getFamilyDetail,
  removeMember,
  renameFamily,
  type FamilyDetail as FamilyDetailType,
} from "./familyApi";
import { AddMemberForm } from "./AddMemberForm";

export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId: familyIdParam } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FamilyDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    if (!familyIdParam) return;
    let cancelled = false;
    getFamilyDetail(familyIdParam)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setNameInput(result.name);
        }
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
  }, [familyIdParam]);

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }
  if (!detail || !familyIdParam) {
    return <p role="alert">{t("family.actionFailed")}</p>;
  }
  const familyId = familyIdParam;

  const myMembership = detail.members.find((member) => member.user_id === user?.id);
  const myRole = myMembership?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  async function handleRename() {
    setError(null);
    try {
      const updated = await renameFamily(familyId, nameInput);
      setDetail((current) => (current ? { ...current, name: updated.name } : current));
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("family.confirmDelete"))) return;
    setError(null);
    try {
      await deleteFamily(familyId);
      navigate("/families");
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleRemoveOrLeave(userId: string, isSelf: boolean) {
    if (isSelf && !window.confirm(t("family.confirmLeave"))) return;
    setError(null);
    try {
      await removeMember(familyId, userId);
      if (isSelf) {
        navigate("/families");
        return;
      }
      setDetail((current) =>
        current
          ? {
              ...current,
              members: current.members.filter((member) => member.user_id !== userId),
            }
          : current,
      );
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleRoleChange(userId: string, role: "admin" | "member") {
    setError(null);
    try {
      const updated = await changeMemberRole(familyId, userId, role);
      setDetail((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user_id === userId ? updated : member,
              ),
            }
          : current,
      );
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  return (
    <main>
      <h1>{detail.name}</h1>
      {canManage && (
        <p>
          <label>
            {t("family.name")}
            <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} />
          </label>
          <button onClick={() => void handleRename()}>{t("family.rename")}</button>
        </p>
      )}
      {isOwner && <button onClick={() => void handleDelete()}>{t("family.delete")}</button>}
      <ul>
        {detail.members.map((member) => {
          const isSelf = member.user_id === user?.id;
          const canRemove = isSelf
            ? member.role !== "owner"
            : isOwner
              ? member.role !== "owner"
              : canManage && member.role === "member";
          return (
            <li key={member.user_id}>
              <span>{member.display_name}</span> ({t(`role.${member.role}`)})
              {isOwner && member.role !== "owner" && (
                <select
                  value={member.role}
                  onChange={(event) =>
                    void handleRoleChange(
                      member.user_id,
                      event.target.value as "admin" | "member",
                    )
                  }
                >
                  <option value="member">{t("role.member")}</option>
                  <option value="admin">{t("role.admin")}</option>
                </select>
              )}
              {canRemove && (
                <button onClick={() => void handleRemoveOrLeave(member.user_id, isSelf)}>
                  {isSelf ? t("family.leaveFamily") : t("family.removeMember")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <AddMemberForm
          familyId={familyId}
          onAdded={(member) =>
            setDetail((current) =>
              current ? { ...current, members: [...current.members, member] } : current,
            )
          }
        />
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
