import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  useChangeMemberRole,
  useDeleteFamily,
  useFamilyDetail,
  useRemoveMember,
  useRenameFamily,
} from "./familyQueries";
import { LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { buttonClassName } from "../components/ui/buttonClassName";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";

export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId: familyIdParam } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const detailQuery = useFamilyDetail(familyIdParam ?? "");
  const detail = detailQuery.data ?? null;
  const isLoading = detailQuery.isLoading;
  const [nameInput, setNameInput] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToConfirm, setMemberToConfirm] = useState<{
    userId: string;
    displayName: string;
    isSelf: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameInputId = "family-name";
  const renameFamily = useRenameFamily(familyIdParam ?? "");
  const deleteFamilyMutation = useDeleteFamily(familyIdParam ?? "");
  const removeMember = useRemoveMember(familyIdParam ?? "");
  const changeMemberRole = useChangeMemberRole(familyIdParam ?? "");

  useEffect(() => {
    if (detail) {
      setNameInput(detail.name);
    }
  }, [detail]);

  if (isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("family.myFamilies")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }
  if (!detail || !familyIdParam) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("family.myFamilies")} />
          <Alert variant="error" role="alert">
            {t("family.actionFailed")}
          </Alert>
        </main>
      </PageFrame>
    );
  }
  const familyId = familyIdParam;

  const myMembership = detail.members.find((member) => member.user_id === user?.id);
  const myRole = myMembership?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";
  const moneySummaries: string[] = [];
  if (detail.monthly_income) {
    moneySummaries.push(
      `${t("family.monthlyIncomeShort")}: ${formatMoney(detail.monthly_income, detail.currency_code)}`,
    );
  }
  if (detail.savings_goal_amount) {
    moneySummaries.push(
      `${t("family.savingsGoalShort")}: ${formatMoney(detail.savings_goal_amount, detail.currency_code)}`,
    );
  }
  const familyTypeLabel = detail.family_type === "solo" ? t("family.typeSolo") : t("family.typeShared");
  const summaryText =
    moneySummaries.length > 0
      ? moneySummaries.join(" • ")
      : `${t("family.currency")}: ${detail.currency_code.toUpperCase()}`;

  function handleRename() {
    if (!detail) {
      return;
    }

    setError(null);
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setError(t("family.nameRequired"));
      return;
    }

    if (trimmedName === detail.name) {
      setIsEditingName(false);
      return;
    }

    renameFamily.mutate(trimmedName, {
      onSuccess: () => {
        setIsEditingName(false);
        showSnackbar({ message: t("family.renameSuccess"), variant: "success" });
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleDelete() {
    setError(null);
    deleteFamilyMutation.mutate(undefined, {
      onSuccess: () => {
        showSnackbar({ message: t("family.deleteSuccess"), variant: "success" });
        navigate("/families");
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleRemoveOrLeave(userId: string, isSelf: boolean) {
    setError(null);
    removeMember.mutate(userId, {
      onSuccess: () => {
        if (isSelf) {
          showSnackbar({ message: t("family.leaveSuccess"), variant: "success" });
          navigate("/families");
          return;
        }
        showSnackbar({ message: t("family.removeSuccess"), variant: "success" });
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleRoleChange(userId: string, role: "admin" | "member") {
    setError(null);
    changeMemberRole.mutate(
      { userId, role },
      {
        onSuccess: () => {
          showSnackbar({ message: t("family.roleChangeSuccess"), variant: "success" });
        },
        onError: () => {
          setError(t("family.actionFailed"));
          showSnackbar({ message: t("family.actionFailed"), variant: "error" });
        },
      },
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={detail.name}
          description={summaryText}
          actions={
            <nav className="surface-card flex flex-wrap items-center gap-2 p-2" data-tour="family-detail-actions" aria-label={t("finance.sections")}>
              <Link
                to={`/families/${familyId}/expenses`}
                data-tour="family-go-expenses"
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("expense.myExpenses")}
              </Link>
{/*              <Link
                to={`/families/${familyId}/receipts`}
                data-tour="family-go-receipts"
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("receipt.myReceipts")}
              </Link>*/}
              <Link
                to={`/families/${familyId}/finance/accounts`}
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("finance.accountsLedger")}
              </Link>
              <Link
                to={`/families/${familyId}/finance/goals`}
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("finance.goals")}
              </Link>
              <Link
                to={`/families/${familyId}/finance/subscriptions`}
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("finance.subscriptions")}
              </Link>
              <Link
                to={`/families/${familyId}/finance/splits`}
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("finance.splitExpenses")}
              </Link>
              <Link
                to={`/families/${familyId}/finance/data`}
                className={buttonClassName({ variant: "ghost", size: "sm", className: "no-underline" })}
              >
                {t("finance.dataOps")}
              </Link>

              {isOwner && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="sm:ml-auto"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  {t("family.delete")}
                </Button>
              )}
            </nav>
          }
        />

        {error && (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>{t("family.type")}</CardDescription>
              <CardTitle>{familyTypeLabel}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("family.currency")}</CardDescription>
              <CardTitle>{detail.currency_code.toUpperCase()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("family.myFamilies")}</CardDescription>
              <CardTitle>{String(detail.members.length)}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.9fr_1fr]">
          <Card data-tour="family-members-card">
            <CardHeader>
              <CardTitle>{t("family.myFamilies")}</CardTitle>
              <CardDescription>
                {familyTypeLabel}
                {moneySummaries.length > 0 ? ` • ${moneySummaries.join(" • ")}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3" data-tour="family-members-list">
                {detail.members.map((member) => {
                  const isSelf = member.user_id === user?.id;
                  const canRemove = isSelf
                    ? member.role !== "owner"
                    : isOwner
                      ? member.role !== "owner"
                      : canManage && member.role === "member";
                  return (
                    <li
                      key={member.user_id}
                      data-role={member.role}
                      className="interactive-row group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <span className="min-w-0 wrap-break-word font-medium text-foreground transition-colors group-hover:text-primary">
                          {member.display_name}
                        </span>
                        <Badge variant="neutral">{t(`role.${member.role}`)}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {isOwner && member.role !== "owner" && (
                          <select
                            value={member.role}
                            onChange={(event) =>
                              handleRoleChange(
                                member.user_id,
                                event.target.value as "admin" | "member",
                              )
                            }
                            className="min-h-10 w-36"
                          >
                            <option value="member">{t("role.member")}</option>
                            <option value="admin">{t("role.admin")}</option>
                          </select>
                        )}
                        {canRemove && (
                          <Button
                            type="button"
                            variant={isSelf ? "outline" : "destructive"}
                            size="sm"
                            onClick={() =>
                              setMemberToConfirm({
                                userId: member.user_id,
                                displayName: member.display_name,
                                isSelf,
                              })
                            }
                          >
                            {isSelf ? t("family.leaveFamily") : t("family.removeMember")}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-6" data-tour="family-settings">
            {canManage && (
              <Card data-tour="family-rename-card">
                <CardHeader>
                  <CardTitle>{t("family.rename")}</CardTitle>
                  <CardDescription>{t("family.name")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isEditingName ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{detail.name}</p>
                      <Button type="button" variant="outline" onClick={() => setIsEditingName(true)}>
                        {t("common.edit")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <label htmlFor={nameInputId} className="type-label">
                        {t("family.name")}
                      </label>
                      <input
                        id={nameInputId}
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => handleRename()}>
                          {t("family.rename")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setNameInput(detail.name);
                            setIsEditingName(false);
                          }}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <Modal
          isOpen={isDeleteModalOpen}
          title={t("family.delete")}
          description={t("family.confirmDelete")}
          closeLabel={t("common.close")}
          onClose={() => setIsDeleteModalOpen(false)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  handleDelete();
                  setIsDeleteModalOpen(false);
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        />

        <Modal
          isOpen={Boolean(memberToConfirm)}
          title={memberToConfirm?.isSelf ? t("family.leaveFamily") : t("family.removeMember")}
          description={memberToConfirm?.isSelf ? t("family.confirmLeave") : memberToConfirm?.displayName}
          closeLabel={t("common.close")}
          onClose={() => setMemberToConfirm(null)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setMemberToConfirm(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant={memberToConfirm?.isSelf ? "outline" : "destructive"}
                onClick={() => {
                  if (!memberToConfirm) return;
                  handleRemoveOrLeave(memberToConfirm.userId, memberToConfirm.isSelf);
                  setMemberToConfirm(null);
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        />
      </main>
    </PageFrame>
  );
}
