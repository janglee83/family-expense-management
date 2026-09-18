import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useFamilies } from "../families/familyQueries";
import { translateApiError } from "../api/errorI18n";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { DateRangePicker, type DateRange } from "../finance/DateRangePicker";
import { formatMoney } from "../utils/currency";
import { useCreateTrip, useTrips } from "./queries/tripQueries";
import type { Trip } from "./tripApi";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tripStatusVariant(status: Trip["status"]): "info" | "success" | "neutral" | "danger" {
  if (status === "ongoing") return "success";
  if (status === "cancelled") return "danger";
  if (status === "completed") return "neutral";
  return "info";
}

interface CreateTripFieldErrors {
  name?: string;
  dateRange?: string;
  budget?: string;
}

export function TripsPage() {
  const { t } = useTranslation();
  const familiesQuery = useFamilies();
  const families = useMemo(() => familiesQuery.data ?? [], [familiesQuery.data]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

  useEffect(() => {
    if (families.length > 0 && !selectedFamilyId) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  const tripsQuery = useTrips(selectedFamilyId);
  const trips = tripsQuery.data ?? [];
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? null;
  const currencyCode = selectedFamily?.currency_code ?? "jpy";

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ fromDate: todayIso(), toDate: todayIso() });
  const [budgetInput, setBudgetInput] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CreateTripFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const createTripMutation = useCreateTrip(selectedFamilyId);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFamilyId) return;

    const errors: CreateTripFieldErrors = {};
    if (!name.trim()) {
      errors.name = t("trip.nameRequired");
    }
    if (dateRange.toDate < dateRange.fromDate) {
      errors.dateRange = t("trip.dateRangeInvalid");
    }
    const parsedBudget = budgetInput.trim() ? Number(budgetInput) : null;
    if (budgetInput.trim() && (!Number.isFinite(parsedBudget) || (parsedBudget ?? 0) <= 0)) {
      errors.budget = t("trip.budgetInvalid");
    }

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    createTripMutation.mutate(
      {
        name: name.trim(),
        destination: destination.trim() || null,
        start_date: dateRange.fromDate,
        end_date: dateRange.toDate,
        budget_amount: parsedBudget,
      },
      {
        onSuccess: () => {
          setName("");
          setDestination("");
          setDateRange({ fromDate: todayIso(), toDate: todayIso() });
          setBudgetInput("");
          setFieldErrors({});
        },
        onError: (err) => {
          setFormError(translateApiError(t, err, "trip.actionFailed"));
        },
      },
    );
  }

  if (familiesQuery.isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.trips")} description={t("trip.tripsDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("trip.trips")} description={t("trip.tripsDescription")} />

        {families.length > 1 ? (
          <Field label={t("dashboard.family")} htmlFor="trips-family-select">
            <select
              id="trips-family-select"
              value={selectedFamilyId}
              className="min-h-10"
              onChange={(event) => setSelectedFamilyId(event.target.value)}
            >
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {families.length === 0 ? (
          <EmptyState
            title={t("trip.noFamilies")}
            action={
              <Link to="/families/new" className="no-underline">
                <Button type="button">{t("family.create")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("trip.createTrip")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCreate} noValidate>
                  <Field label={t("trip.name")} htmlFor="trip-name" required error={fieldErrors.name}>
                    <input
                      id="trip-name"
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setFieldErrors((current) => ({ ...current, name: undefined }));
                      }}
                    />
                  </Field>

                  <Field label={t("trip.destination")} htmlFor="trip-destination">
                    <input
                      id="trip-destination"
                      type="text"
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                    />
                  </Field>

                  <Field
                    label={t("trip.dateRange")}
                    htmlFor="trip-date-range"
                    required
                    error={fieldErrors.dateRange}
                  >
                    <div id="trip-date-range">
                      <DateRangePicker
                        fromDate={dateRange.fromDate}
                        toDate={dateRange.toDate}
                        onChange={(range) => {
                          setDateRange(range);
                          setFieldErrors((current) => ({ ...current, dateRange: undefined }));
                        }}
                      />
                    </div>
                  </Field>

                  <Field
                    label={t("trip.budgetWithCurrency", { currency: currencyCode.toUpperCase() })}
                    htmlFor="trip-budget"
                    error={fieldErrors.budget}
                  >
                    <input
                      id="trip-budget"
                      type="number"
                      min={1}
                      value={budgetInput}
                      onChange={(event) => {
                        setBudgetInput(event.target.value);
                        setFieldErrors((current) => ({ ...current, budget: undefined }));
                      }}
                    />
                  </Field>

                  <Button type="submit" loading={createTripMutation.isPending}>
                    {t("trip.createTrip")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {formError ? (
              <Alert variant="error" role="alert">
                {formError}
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t("trip.tripList")}</CardTitle>
              </CardHeader>
              <CardContent>
                {tripsQuery.isLoading ? (
                  <LoadingState label={t("common.loading")} />
                ) : trips.length === 0 ? (
                  <EmptyState title={t("trip.noTrips")} />
                ) : (
                  <ul className="space-y-3">
                    {trips.map((trip) => (
                      <li key={trip.id} className="interactive-row space-y-2 p-4">
                        <Link
                          to={`/families/${selectedFamilyId}/trips/${trip.id}`}
                          className="block no-underline"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-foreground">{trip.name}</p>
                            <Badge variant={tripStatusVariant(trip.status)}>
                              {t(`trip.statusValues.${trip.status}`)}
                            </Badge>
                          </div>
                          {trip.destination ? (
                            <p className="text-sm text-muted-foreground">{trip.destination}</p>
                          ) : null}
                          <p className="text-sm text-muted-foreground">
                            {trip.start_date} → {trip.end_date}
                          </p>
                          <p className="font-mono text-sm text-foreground">
                            {formatMoney(trip.actual_total, currencyCode)}
                            {trip.budget_amount
                              ? ` / ${formatMoney(trip.budget_amount, currencyCode)}`
                              : trip.planned_total
                                ? ` (${t("trip.plannedShort")}: ${formatMoney(trip.planned_total, currencyCode)})`
                                : ""}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </PageFrame>
  );
}
