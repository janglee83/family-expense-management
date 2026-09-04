import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import { useSnackbar } from "../components/ui/Snackbar";
import { PageFrame, PageHeader, EmptyState, LoadingState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import {
  createCategory,
  deleteCategory,
  deleteExpense,
  listCategories,
  listExpenses,
  renameCategory,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "./expenseApi";
import { ExpenseForm } from "./ExpenseForm";
import { formatMoney } from "../utils/currency";
import { CATEGORY_ICON_OPTIONS, resolveCategoryIconSymbol } from "./categoryIcons";

export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [familyCurrencyCode, setFamilyCurrencyCode] = useState("jpy");
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewingExpenseId, setViewingExpenseId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("tag");
  const [isCategorySubmitting, setIsCategorySubmitting] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<Category | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const categoryNameInputId = `expense-category-new-${familyId ?? "none"}`;
  const categoryIconInputId = `expense-category-icon-${familyId ?? "none"}`;

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    setError(null);

    Promise.all([listExpenses(familyId), listCategories(familyId), getFamilyDetail(familyId)])
      .then(([expenseResult, categoryResult, familyDetail]) => {
        if (cancelled) return;
        setExpenses(expenseResult);
        setCategories(categoryResult);
        setMemberNames(
          Object.fromEntries(
            familyDetail.members.map((member) => [member.user_id, member.display_name]),
          ),
        );
        setFamilyCurrencyCode(familyDetail.currency_code);
        setMyRole(familyDetail.members.find((member) => member.user_id === user?.id)?.role);
      })
      .catch(() => {
        if (!cancelled) {
          setExpenses([]);
          setCategories([]);
          setError(t("expense.actionFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId, user?.id, t]);

  const canManage = myRole === "owner" || myRole === "admin";

  function categoryDisplayName(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    return category ? resolveCategoryDisplayName(category, t) : categoryId;
  }

  function categoryDisplayIcon(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return "🏷";
    }
    return resolveCategoryIconSymbol(category.icon, category.name);
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!familyId) return;
    setError(null);
    try {
      await deleteExpense(familyId, expenseId);
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
      showSnackbar({ message: t("expense.deleteSuccess"), variant: "success" });
    } catch {
      setError(t("expense.actionFailed"));
      showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
    }
  }

  async function handleCreateCategory() {
    if (!familyId) return;

    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      return;
    }

    setError(null);
    setIsCategorySubmitting(true);
    try {
      const created = await createCategory(familyId, trimmedName, newCategoryIcon);
      setCategories((current) => [...current, created]);
      setNewCategoryName("");
      setNewCategoryIcon("tag");
      setIsAddingCategory(false);
      showSnackbar({ message: t("expense.categoryAdded"), variant: "success" });
    } catch {
      setError(t("expense.actionFailed"));
      showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
    } finally {
      setIsCategorySubmitting(false);
    }
  }

  async function handleRenameCategory(categoryId: string, newName: string) {
    if (!familyId) return;

    setError(null);
    try {
      const updated = await renameCategory(familyId, categoryId, newName);
      setCategories((current) =>
        current.map((category) => (category.id === categoryId ? updated : category)),
      );
      showSnackbar({ message: t("expense.categoryRenamed"), variant: "success" });
    } catch {
      setError(t("expense.actionFailed"));
      showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!familyId) return;

    setError(null);
    try {
      await deleteCategory(familyId, categoryId);
      setCategories((current) => current.filter((category) => category.id !== categoryId));
      showSnackbar({ message: t("expense.categoryDeleted"), variant: "success" });
    } catch {
      setError(t("expense.actionFailed"));
      showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
    }
  }

  const deletingExpense = deletingExpenseId
    ? expenses.find((expense) => expense.id === deletingExpenseId) ?? null
    : null;
  const viewingExpense = viewingExpenseId
    ? expenses.find((expense) => expense.id === viewingExpenseId) ?? null
    : null;
  const deletingCategory = deletingCategoryId
    ? categories.find((category) => category.id === deletingCategoryId) ?? null
    : null;
  const customCategories = categories.filter((category) => category.family_id !== null);

  if (isLoading || !familyId) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("expense.myExpenses")} description={t("family.myFamilies")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={t("expense.myExpenses")}
          description={t("family.myFamilies")}
          actions={
            !isCreating ? (
              <Button type="button" onClick={() => setIsCreating(true)} data-tour="expense-create-action">
                {t("expense.addExpense")}
              </Button>
            ) : undefined
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
              <CardDescription>{t("expense.myExpenses")}</CardDescription>
              <CardTitle>{String(expenses.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("expense.category")}</CardDescription>
              <CardTitle>{String(categories.length)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t("role.member")}</CardDescription>
              <CardTitle>{canManage ? t("role.admin") : t("role.member")}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        {isCreating && (
          <Card className="enter-rise" data-tour="expense-create-form-card">
            <CardHeader>
              <CardTitle>{t("expense.addExpense")}</CardTitle>
              <CardDescription>{t("expense.myExpenses")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpenseForm
                familyId={familyId}
                currencyCode={familyCurrencyCode}
                onSaved={(expense) => {
                  setExpenses((current) => [expense, ...current]);
                  void listCategories(familyId).then(setCategories);
                  setIsCreating(false);
                  showSnackbar({ message: t("expense.createSuccess"), variant: "success" });
                }}
                onCancel={() => setIsCreating(false)}
              />
            </CardContent>
          </Card>
        )}

        <Card data-tour="expense-list-card">
          <CardHeader>
            <CardTitle>{t("expense.myExpenses")}</CardTitle>
            <CardDescription>{t("expense.category")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {expenses.length === 0 ? (
              !error && <EmptyState title={t("expense.noExpenses")} />
            ) : (
                <ul className="space-y-3" data-tour="expense-list-items">
                {expenses.map((expense) => {
                  const canEditThis = canManage || expense.created_by_user_id === user?.id;
                  if (editingExpenseId === expense.id) {
                    return (
                      <li key={expense.id} className="surface-card p-4">
                        <ExpenseForm
                          familyId={familyId}
                          expense={expense}
                          currencyCode={familyCurrencyCode}
                          onSaved={(updated) => {
                            setExpenses((current) =>
                              current.map((item) => (item.id === updated.id ? updated : item)),
                            );
                            void listCategories(familyId).then(setCategories);
                            setEditingExpenseId(null);
                            showSnackbar({ message: t("expense.updateSuccess"), variant: "success" });
                          }}
                          onCancel={() => setEditingExpenseId(null)}
                        />
                      </li>
                    );
                  }
                  return (
                    <li
                      key={expense.id}
                      data-shared={expense.is_shared ? "true" : "false"}
                      className="interactive-row group flex flex-col gap-3 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-lg font-semibold text-foreground group-hover:text-primary">
                          {formatMoney(expense.amount, familyCurrencyCode)}
                        </span>
                        <Badge
                          variant={expense.is_shared ? "info" : "neutral"}
                          data-shared={expense.is_shared ? "true" : "false"}
                        >
                          {expense.is_shared ? t("expense.shared") : t("expense.personal")}
                        </Badge>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <span className="wrap-break-word text-foreground">
                          {categoryDisplayIcon(expense.category_id)} {categoryDisplayName(expense.category_id)}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span className="min-w-0 break-all">
                          {memberNames[expense.payer_user_id] ?? expense.payer_user_id}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span>{expense.expense_date}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingExpenseId(expense.id)}
                        >
                          {t("expense.viewExpense")}
                        </Button>
                        {canEditThis ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingExpenseId(expense.id)}
                            >
                              {t("expense.editExpense")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeletingExpenseId(expense.id)}
                            >
                              {t("expense.deleteExpense")}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card className="h-fit" data-tour="expense-categories-card">
            <CardHeader>
              <CardTitle>{t("expense.manageCategories")}</CardTitle>
              <CardDescription>{t("expense.manageCategoriesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {customCategories.map((category) => (
                    <li
                      key={category.id}
                      className="interactive-row group flex flex-wrap items-center justify-between gap-3"
                    >
                      <span className="min-w-0 wrap-break-word font-medium text-foreground">
                        {resolveCategoryIconSymbol(category.icon, category.name)} {category.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRenamingCategory(category);
                            setRenameCategoryName(category.name);
                          }}
                        >
                          {t("family.rename")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeletingCategoryId(category.id)}
                        >
                          {t("family.delete")}
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>

              {customCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("expense.noCustomCategories")}</p>
              ) : null}

              {!isAddingCategory ? (
                <Button type="button" variant="secondary" onClick={() => setIsAddingCategory(true)}>
                  {t("expense.addCategory")}
                </Button>
              ) : (
                <form
                  className="space-y-3 rounded-md border border-border/80 bg-muted/35 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateCategory();
                  }}
                >
                  <Field label={t("expense.newCategoryName")} htmlFor={categoryNameInputId} required>
                    <input
                      id={categoryNameInputId}
                      type="text"
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      required
                    />
                  </Field>

                  <Field label={t("expense.categoryIcon")} htmlFor={categoryIconInputId} required>
                    <select
                      id={categoryIconInputId}
                      value={newCategoryIcon}
                      className="min-h-10"
                      onChange={(event) => setNewCategoryIcon(event.target.value)}
                    >
                      {CATEGORY_ICON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.symbol} {t(`expense.icon.${option.value}`)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="secondary"
                      loading={isCategorySubmitting}
                      loadingLabel={t("common.loading")}
                    >
                      {t("common.confirm")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName("");
                        setNewCategoryIcon("tag");
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        <Modal
          isOpen={Boolean(renamingCategory)}
          title={t("family.rename")}
          description={renamingCategory?.name}
          closeLabel={t("common.close")}
          onClose={() => {
            setRenamingCategory(null);
            setRenameCategoryName("");
          }}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenamingCategory(null);
                  setRenameCategoryName("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!renamingCategory) return;
                  const trimmedName = renameCategoryName.trim();
                  if (!trimmedName) {
                    setError(t("expense.actionFailed"));
                    return;
                  }
                  void handleRenameCategory(renamingCategory.id, trimmedName);
                  setRenamingCategory(null);
                  setRenameCategoryName("");
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        >
          <Field label={t("expense.newCategoryName")} htmlFor="rename-category-input" required>
            <input
              id="rename-category-input"
              type="text"
              value={renameCategoryName}
              onChange={(event) => setRenameCategoryName(event.target.value)}
            />
          </Field>
        </Modal>

        <Modal
          isOpen={Boolean(viewingExpense)}
          title={t("expense.expenseDetails")}
          description={
            viewingExpense ? formatMoney(viewingExpense.amount, familyCurrencyCode) : undefined
          }
          closeLabel={t("common.close")}
          onClose={() => setViewingExpenseId(null)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setViewingExpenseId(null)}>
                {t("common.close")}
              </Button>
              {viewingExpense &&
              (canManage || viewingExpense.created_by_user_id === user?.id) ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditingExpenseId(viewingExpense.id);
                    setViewingExpenseId(null);
                  }}
                >
                  {t("expense.editExpense")}
                </Button>
              ) : null}
            </>
          }
        >
          {viewingExpense ? (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("expense.category")}</dt>
                <dd>
                  {categoryDisplayIcon(viewingExpense.category_id)} {categoryDisplayName(viewingExpense.category_id)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("expense.payer")}</dt>
                <dd>{memberNames[viewingExpense.payer_user_id] ?? viewingExpense.payer_user_id}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("expense.date")}</dt>
                <dd>{viewingExpense.expense_date}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("expense.description")}</dt>
                <dd>{viewingExpense.description || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("expense.shared")}</dt>
                <dd>{viewingExpense.is_shared ? t("common.yes") : t("common.no")}</dd>
              </div>
            </dl>
          ) : null}
        </Modal>

        <Modal
          isOpen={Boolean(deletingExpense)}
          title={t("expense.confirmDeleteExpense")}
          description={
            deletingExpense ? formatMoney(deletingExpense.amount, familyCurrencyCode) : undefined
          }
          closeLabel={t("common.close")}
          onClose={() => setDeletingExpenseId(null)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setDeletingExpenseId(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (!deletingExpense) return;
                  void handleDeleteExpense(deletingExpense.id);
                  setDeletingExpenseId(null);
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        />

        <Modal
          isOpen={Boolean(deletingCategory)}
          title={t("expense.confirmDeleteCategory")}
          description={deletingCategory?.name}
          closeLabel={t("common.close")}
          onClose={() => setDeletingCategoryId(null)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setDeletingCategoryId(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (!deletingCategory) return;
                  void handleDeleteCategory(deletingCategory.id);
                  setDeletingCategoryId(null);
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
