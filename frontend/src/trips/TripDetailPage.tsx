import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { DateRangePicker, type DateRange } from "../finance/DateRangePicker";
import { formatMoney } from "../utils/currency";
import {
  useAddTripParticipant,
  useCreateTripItem,
  useDeleteTrip,
  useDeleteTripItem,
  useRemoveTripParticipant,
  useTripDetail,
  useUpdateTrip,
  useUpdateTripItem,
} from "./queries/tripQueries";
import type { TripItineraryItem } from "./tripApi";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ItemFieldErrors {
  title?: string;
  date?: string;
  amount?: string;
}

interface ItemFormState {
  title: string;
  description: string;
  linkUrl: string;
  itemDate: string;
  itemTime: string;
  plannedAmount: string;
}

function emptyItemForm(defaultDate: string): ItemFormState {
  return {
    title: "",
    description: "",
    linkUrl: "",
    itemDate: defaultDate,
    itemTime: "",
    plannedAmount: "",
  };
}

function itemFormFromExisting(item: TripItineraryItem): ItemFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    linkUrl: item.link_url ?? "",
    itemDate: item.item_date,
    itemTime: item.item_time ?? "",
    plannedAmount: item.planned_amount ? String(item.planned_amount) : "",
  };
}

export function TripDetailPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { familyId, tripId } = useParams<{ familyId: string; tripId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const tripQuery = useTripDetail(familyId ?? "", tripId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const trip = tripQuery.data ?? null;
  const members = familyDetailQuery.data?.members ?? [];
  const currencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading = tripQuery.isLoading || familyDetailQuery.isLoading;
  const queryError = tripQuery.isError || familyDetailQuery.isError ? t("trip.actionFailed") : null;
  const error = queryError ?? formError;

  const myRole = familyDetailQuery.data?.members.find((member) => member.user_id === user?.id)?.role;
  const canManageTrip = trip?.created_by_user_id === user?.id || myRole === "owner" || myRole === "admin";

  const updateTripMutation = useUpdateTrip(familyId ?? "", tripId ?? "");
  const deleteTripMutation = useDeleteTrip(familyId ?? "");
  const addParticipantMutation = useAddTripParticipant(familyId ?? "", tripId ?? "");
  const removeParticipantMutation = useRemoveTripParticipant(familyId ?? "", tripId ?? "");
  const createItemMutation = useCreateTripItem(familyId ?? "", tripId ?? "");
  const updateItemMutation = useUpdateTripItem(familyId ?? "", tripId ?? "");
  const deleteItemMutation = useDeleteTripItem(familyId ?? "", tripId ?? "");

  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editRange, setEditRange] = useState<DateRange>({ fromDate: todayIso(), toDate: todayIso() });
  const [editBudget, setEditBudget] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<{
    name?: string;
    dateRange?: string;
    budget?: string;
  }>({});

  function openEditTrip() {
    if (!trip) return;
    setEditName(trip.name);
    setEditDestination(trip.destination ?? "");
    setEditRange({ fromDate: trip.start_date, toDate: trip.end_date });
    setEditBudget(trip.budget_amount ? String(trip.budget_amount) : "");
    setEditFieldErrors({});
    setIsEditingTrip(true);
  }

  function handleUpdateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: typeof editFieldErrors = {};
    if (!editName.trim()) {
      errors.name = t("trip.nameRequired");
    }
    if (editRange.toDate < editRange.fromDate) {
      errors.dateRange = t("trip.dateRangeInvalid");
    }
    const parsedBudget = editBudget.trim() ? Number(editBudget) : null;
    if (editBudget.trim() && (!Number.isFinite(parsedBudget) || (parsedBudget ?? 0) <= 0)) {
      errors.budget = t("trip.budgetInvalid");
    }

    setEditFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    updateTripMutation.mutate(
      {
        name: editName.trim(),
        destination: editDestination.trim() || null,
        start_date: editRange.fromDate,
        end_date: editRange.toDate,
        budget_amount: parsedBudget,
      },
      {
        onSuccess: () => {
          setIsEditingTrip(false);
          showSnackbar({ message: t("trip.updateSuccess"), variant: "success" });
        },
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      },
    );
  }

  function handleCancelTrip() {
    if (!trip) return;
    setFormError(null);
    updateTripMutation.mutate(
      { is_cancelled: !trip.is_cancelled },
      {
        onSuccess: () => showSnackbar({ message: t("trip.updateSuccess"), variant: "success" }),
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      },
    );
  }

  function handleDeleteTrip() {
    setFormError(null);
    deleteTripMutation.mutate(tripId ?? "", {
      onSuccess: () => showSnackbar({ message: t("trip.deleteSuccess"), variant: "success" }),
      onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
    });
  }

  function handleToggleParticipant(memberId: string, isCurrentlyParticipant: boolean) {
    setFormError(null);
    if (isCurrentlyParticipant) {
      removeParticipantMutation.mutate(memberId, {
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    } else {
      addParticipantMutation.mutate(memberId, {
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    }
  }

  const [editingItem, setEditingItem] = useState<TripItineraryItem | "new" | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm(trip?.start_date ?? todayIso()));
  const [itemFieldErrors, setItemFieldErrors] = useState<ItemFieldErrors>({});

  function openNewItem() {
    setItemForm(emptyItemForm(trip?.start_date ?? todayIso()));
    setItemFieldErrors({});
    setEditingItem("new");
  }

  function openEditItem(item: TripItineraryItem) {
    setItemForm(itemFormFromExisting(item));
    setItemFieldErrors({});
    setEditingItem(item);
  }

  function closeItemModal() {
    setEditingItem(null);
    setItemFieldErrors({});
  }

  function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;

    const errors: ItemFieldErrors = {};
    if (!itemForm.title.trim()) {
      errors.title = t("trip.itemTitleRequired");
    }
    if (itemForm.itemDate < trip.start_date || itemForm.itemDate > trip.end_date) {
      errors.date = t("trip.itemDateOutOfRange");
    }
    const parsedAmount = itemForm.plannedAmount.trim() ? Number(itemForm.plannedAmount) : null;
    if (itemForm.plannedAmount.trim() && (!Number.isFinite(parsedAmount) || (parsedAmount ?? 0) <= 0)) {
      errors.amount = t("trip.plannedAmountInvalid");
    }

    setItemFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      title: itemForm.title.trim(),
      description: itemForm.description.trim() || null,
      link_url: itemForm.linkUrl.trim() || null,
      item_date: itemForm.itemDate,
      item_time: itemForm.itemTime || null,
      planned_amount: parsedAmount,
    };

    if (editingItem === "new") {
      createItemMutation.mutate(payload, {
        onSuccess: () => {
          closeItemModal();
          showSnackbar({ message: t("trip.itemCreated"), variant: "success" });
        },
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    } else if (editingItem) {
      updateItemMutation.mutate(
        { itemId: editingItem.id, input: payload },
        {
          onSuccess: () => {
            closeItemModal();
            showSnackbar({ message: t("trip.itemUpdated"), variant: "success" });
          },
          onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
        },
      );
    }
  }

  function handleDeleteItem(itemId: string) {
    setFormError(null);
    deleteItemMutation.mutate(itemId, {
      onSuccess: () => showSnackbar({ message: t("trip.itemDeleted"), variant: "success" }),
      onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
    });
  }

  const itemsByDay = useMemo(() => {
    if (!trip) return [];
    const groups = new Map<string, TripItineraryItem[]>();
    for (const item of trip.items) {
      const list = groups.get(item.item_date) ?? [];
      list.push(item);
      groups.set(item.item_date, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([itemDate, items]) => ({
        itemDate,
        items: items.slice().sort((a, b) => (a.item_time ?? "").localeCompare(b.item_time ?? "")),
      }));
  }, [trip]);

  if (!familyId || !tripId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.tripDetail")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  if (!trip) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.tripDetail")} />
          <EmptyState title={t("trip.notFound")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={trip.name}
          description={trip.destination ?? undefined}
          actions={
            canManageTrip ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={openEditTrip}>
                  {t("common.edit")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCancelTrip}>
                  {trip.is_cancelled ? t("trip.resume") : t("trip.cancel")}
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteTrip}>
                  {t("family.delete")}
                </Button>
              </>
            ) : undefined
          }
        />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{formatMoney(trip.actual_total, currencyCode)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.actualSpent")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{formatMoney(trip.planned_total, currencyCode)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.plannedTotal")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {trip.budget_amount ? formatMoney(trip.budget_amount, currencyCode) : "-"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.budget")}</p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("trip.participants")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {members.map((member) => {
                const isParticipant = trip.participant_user_ids.includes(member.user_id);
                return (
                  <li key={member.user_id}>
                    <button
                      type="button"
                      disabled={!canManageTrip}
                      onClick={() => handleToggleParticipant(member.user_id, isParticipant)}
                      className="disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Badge variant={isParticipant ? "success" : "neutral"}>{member.display_name}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("trip.itinerary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" size="sm" onClick={openNewItem}>
              {t("trip.addItem")}
            </Button>

            {itemsByDay.length === 0 ? (
              <EmptyState title={t("trip.noItems")} />
            ) : (
              <div className="space-y-4">
                {itemsByDay.map(({ itemDate, items }) => (
                  <div key={itemDate} className="surface-card overflow-hidden">
                    <div className="border-b border-border/80 bg-muted/40 px-4 py-2">
                      <p className="text-sm font-semibold text-foreground">{itemDate}</p>
                    </div>
                    <ul>
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.item_time ? (
                                <span className="text-xs font-semibold text-muted-foreground">
                                  {item.item_time}
                                </span>
                              ) : null}
                              <span className="font-medium text-foreground">{item.title}</span>
                            </div>
                            {item.description ? (
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            {item.link_url ? (
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-primary hover:underline"
                              >
                                {item.link_url}
                              </a>
                            ) : null}
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-2">
                            {item.planned_amount ? (
                              <span className="font-mono text-sm text-muted-foreground">
                                {t("trip.plannedShort")}: {formatMoney(item.planned_amount, currencyCode)}
                              </span>
                            ) : null}
                            {item.actual_amount > 0 ? (
                              <span className="font-mono text-sm text-foreground">
                                {t("trip.actualShort")}: {formatMoney(item.actual_amount, currencyCode)}
                              </span>
                            ) : null}
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => openEditItem(item)}>
                                {t("common.edit")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                {t("family.delete")}
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={isEditingTrip}
          title={t("trip.editTrip")}
          closeLabel={t("common.close")}
          onClose={() => setIsEditingTrip(false)}
        >
          <form className="space-y-4" onSubmit={handleUpdateTrip} noValidate>
            <Field label={t("trip.name")} htmlFor="edit-trip-name" required error={editFieldErrors.name}>
              <input
                id="edit-trip-name"
                type="text"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value);
                  setEditFieldErrors((current) => ({ ...current, name: undefined }));
                }}
              />
            </Field>
            <Field label={t("trip.destination")} htmlFor="edit-trip-destination">
              <input
                id="edit-trip-destination"
                type="text"
                value={editDestination}
                onChange={(event) => setEditDestination(event.target.value)}
              />
            </Field>
            <Field
              label={t("trip.dateRange")}
              htmlFor="edit-trip-date-range"
              required
              error={editFieldErrors.dateRange}
            >
              <div id="edit-trip-date-range">
                <DateRangePicker
                  fromDate={editRange.fromDate}
                  toDate={editRange.toDate}
                  onChange={(range) => {
                    setEditRange(range);
                    setEditFieldErrors((current) => ({ ...current, dateRange: undefined }));
                  }}
                />
              </div>
            </Field>
            <Field
              label={t("trip.budgetWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor="edit-trip-budget"
              error={editFieldErrors.budget}
            >
              <input
                id="edit-trip-budget"
                type="number"
                min={1}
                value={editBudget}
                onChange={(event) => {
                  setEditBudget(event.target.value);
                  setEditFieldErrors((current) => ({ ...current, budget: undefined }));
                }}
              />
            </Field>
            <Button type="submit" loading={updateTripMutation.isPending}>
              {t("common.save")}
            </Button>
          </form>
        </Modal>

        <Modal
          isOpen={editingItem !== null}
          title={editingItem === "new" ? t("trip.addItem") : t("trip.editItem")}
          closeLabel={t("common.close")}
          onClose={closeItemModal}
        >
          <form className="space-y-4" onSubmit={handleSaveItem} noValidate>
            <Field label={t("trip.itemTitle")} htmlFor="item-title" required error={itemFieldErrors.title}>
              <input
                id="item-title"
                type="text"
                value={itemForm.title}
                onChange={(event) => {
                  setItemForm((current) => ({ ...current, title: event.target.value }));
                  setItemFieldErrors((current) => ({ ...current, title: undefined }));
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("trip.itemDate")} htmlFor="item-date" required error={itemFieldErrors.date}>
                <input
                  id="item-date"
                  type="date"
                  min={trip.start_date}
                  max={trip.end_date}
                  value={itemForm.itemDate}
                  onChange={(event) => {
                    setItemForm((current) => ({ ...current, itemDate: event.target.value }));
                    setItemFieldErrors((current) => ({ ...current, date: undefined }));
                  }}
                />
              </Field>
              <Field label={t("trip.itemTime")} htmlFor="item-time">
                <input
                  id="item-time"
                  type="time"
                  value={itemForm.itemTime}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, itemTime: event.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label={t("trip.itemDescription")} htmlFor="item-description">
              <input
                id="item-description"
                type="text"
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
            <Field label={t("trip.itemLink")} htmlFor="item-link">
              <input
                id="item-link"
                type="text"
                value={itemForm.linkUrl}
                onChange={(event) => setItemForm((current) => ({ ...current, linkUrl: event.target.value }))}
                placeholder="https://..."
              />
            </Field>
            <Field
              label={t("trip.plannedAmountWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor="item-amount"
              error={itemFieldErrors.amount}
            >
              <input
                id="item-amount"
                type="number"
                min={1}
                value={itemForm.plannedAmount}
                onChange={(event) => {
                  setItemForm((current) => ({ ...current, plannedAmount: event.target.value }));
                  setItemFieldErrors((current) => ({ ...current, amount: undefined }));
                }}
              />
            </Field>
            <Button
              type="submit"
              loading={editingItem === "new" ? createItemMutation.isPending : updateItemMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </form>
        </Modal>
      </main>
    </PageFrame>
  );
}
