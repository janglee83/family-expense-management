import { apiClient } from "../api/client";
import { buildApiError } from "../api/errors";
import type { components } from "../api/schema.gen";

export type Trip = components["schemas"]["TripResponse"];
export type TripDetail = components["schemas"]["TripDetailResponse"];
export type TripItineraryItem = components["schemas"]["TripItineraryItemResponse"];
export type CreateTripInput = components["schemas"]["CreateTripRequest"];
export type UpdateTripInput = components["schemas"]["UpdateTripRequest"];
export type CreateTripItemInput = components["schemas"]["TripItineraryItemRequest"];
export type UpdateTripItemInput = components["schemas"]["UpdateTripItineraryItemRequest"];

export async function listTrips(familyId: string): Promise<Trip[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/trips/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_trips_failed",
      fallbackMessage: "Failed to list trips",
    });
  }
  return data;
}

export async function getTrip(familyId: string, tripId: string): Promise<TripDetail> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "get_trip_failed",
      fallbackMessage: "Failed to load trip",
    });
  }
  return data;
}

export async function createTrip(familyId: string, input: CreateTripInput): Promise<Trip> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/trips/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_trip_failed",
      fallbackMessage: "Failed to create trip",
    });
  }
  return data;
}

export async function updateTrip(
  familyId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<Trip> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_trip_failed",
      fallbackMessage: "Failed to update trip",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function deleteTrip(familyId: string, tripId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } } },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_trip_failed",
      fallbackMessage: "Failed to delete trip",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
}

export async function addTripParticipant(
  familyId: string,
  tripId: string,
  userId: string,
): Promise<Trip> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, user_id: userId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "add_trip_participant_failed",
      fallbackMessage: "Failed to add participant",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function removeTripParticipant(
  familyId: string,
  tripId: string,
  userId: string,
): Promise<Trip> {
  const { data, error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, user_id: userId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "remove_trip_participant_failed",
      fallbackMessage: "Failed to remove participant",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function createTripItem(
  familyId: string,
  tripId: string,
  input: CreateTripItemInput,
): Promise<TripItineraryItem> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/trips/{trip_id}/items",
    { params: { path: { family_id: familyId, trip_id: tripId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_trip_item_failed",
      fallbackMessage: "Failed to create itinerary item",
    });
  }
  return data;
}

export async function updateTripItem(
  familyId: string,
  tripId: string,
  itemId: string,
  input: UpdateTripItemInput,
): Promise<TripItineraryItem> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, item_id: itemId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_trip_item_failed",
      fallbackMessage: "Failed to update itinerary item",
    });
  }
  return data;
}

export async function deleteTripItem(
  familyId: string,
  tripId: string,
  itemId: string,
): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, item_id: itemId } } },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_trip_item_failed",
      fallbackMessage: "Failed to delete itinerary item",
    });
  }
}
