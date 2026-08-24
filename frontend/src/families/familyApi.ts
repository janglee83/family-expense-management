import { apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type Family = components["schemas"]["FamilyResponse"];
export type FamilyDetail = components["schemas"]["FamilyDetailResponse"];
export type FamilyMemberInfo = components["schemas"]["FamilyMemberResponse"];

export async function listMyFamilies(): Promise<Family[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/");
  if (error || !data) {
    throw new Error("list_families_failed");
  }
  return data;
}

export async function createFamily(name: string): Promise<Family> {
  const { data, error } = await apiClient.POST("/api/v1/families/", {
    body: { name },
  });
  if (error || !data) {
    throw new Error("create_family_failed");
  }
  return data;
}

export async function getFamilyDetail(familyId: string): Promise<FamilyDetail> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    if (response.status === 403) {
      throw new Error("not_a_member");
    }
    throw new Error("family_not_found");
  }
  return data;
}

export async function renameFamily(familyId: string, name: string): Promise<Family> {
  const { data, error } = await apiClient.PATCH("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
    body: { name },
  });
  if (error || !data) {
    throw new Error("rename_family_failed");
  }
  return data;
}

export async function deleteFamily(familyId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error) {
    throw new Error("delete_family_failed");
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
    if (response.status === 404) {
      throw new Error("member_not_found");
    }
    if (response.status === 409) {
      throw new Error("member_already_exists");
    }
    throw new Error("add_member_failed");
  }
  return data;
}

export async function removeMember(familyId: string, userId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}/members/{user_id}", {
    params: { path: { family_id: familyId, user_id: userId } },
  });
  if (error) {
    throw new Error("remove_member_failed");
  }
}

export async function changeMemberRole(
  familyId: string,
  userId: string,
  role: "admin" | "member",
): Promise<FamilyMemberInfo> {
  const { data, error } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/members/{user_id}",
    {
      params: { path: { family_id: familyId, user_id: userId } },
      body: { role },
    },
  );
  if (error || !data) {
    throw new Error("change_role_failed");
  }
  return data;
}
