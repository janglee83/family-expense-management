import { apiClient } from "../api/client";
import { buildApiError } from "../api/errors";
import type { components } from "../api/schema.gen";

export type Family = components["schemas"]["FamilyResponse"];
export type FamilyDetail = components["schemas"]["FamilyDetailResponse"];
export type FamilyMemberInfo = components["schemas"]["FamilyMemberResponse"];
export type FamilyType = components["schemas"]["FamilyType"];
export type CurrencyCode = components["schemas"]["CurrencyCode"];

export interface CreateFamilyInput {
  name: string;
  family_type: FamilyType;
  currency_code: CurrencyCode;
  monthly_income_enabled: boolean;
  member_emails: string[];
  monthly_income?: number | null;
  savings_goal_amount?: number | null;
}

export async function listMyFamilies(): Promise<Family[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/");
  if (error || !data) {
    throw buildApiError({
      status: 500,
      payload: error,
      fallbackCode: "list_families_failed",
      fallbackMessage: "Failed to list families",
    });
  }
  return data;
}

export async function createFamily(input: CreateFamilyInput): Promise<Family> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/", {
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_family_failed",
      fallbackMessage: "Failed to create family",
      codeMap: {
        USER_NOT_FOUND_BY_EMAIL: "member_not_found",
        REQUEST_VALIDATION_ERROR: "validation_failed",
      },
    });
  }
  return data;
}

export async function getFamilyDetail(familyId: string): Promise<FamilyDetail> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "family_not_found",
      fallbackMessage: "Failed to fetch family detail",
      codeMap: {
        FAMILY_MEMBERSHIP_REQUIRED: "not_a_member",
      },
    });
  }
  return data;
}

export async function renameFamily(familyId: string, name: string): Promise<Family> {
  const { data, error, response } = await apiClient.PATCH("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
    body: { name },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "rename_family_failed",
      fallbackMessage: "Failed to rename family",
    });
  }
  return data;
}

export async function deleteFamily(familyId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_family_failed",
      fallbackMessage: "Failed to delete family",
    });
  }
}

export async function addMember(familyId: string, email: string): Promise<FamilyMemberInfo> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/members",
    {
      params: { path: { family_id: familyId } },
      body: { email },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "add_member_failed",
      fallbackMessage: "Failed to add family member",
      codeMap: {
        USER_NOT_FOUND_BY_EMAIL: "member_not_found",
        FAMILY_MEMBER_ALREADY_EXISTS: "member_already_exists",
      },
    });
  }
  return data;
}

export async function removeMember(familyId: string, userId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE("/api/v1/families/{family_id}/members/{user_id}", {
    params: { path: { family_id: familyId, user_id: userId } },
  });
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "remove_member_failed",
      fallbackMessage: "Failed to remove family member",
    });
  }
}

export async function changeMemberRole(
  familyId: string,
  userId: string,
  role: "admin" | "member",
): Promise<FamilyMemberInfo> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/members/{user_id}",
    {
      params: { path: { family_id: familyId, user_id: userId } },
      body: { role },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "change_role_failed",
      fallbackMessage: "Failed to change member role",
    });
  }
  return data;
}
