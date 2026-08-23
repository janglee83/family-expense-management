import { apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type AuthUser = components["schemas"]["UserResponse"];

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const { data, error, response } = await apiClient.POST("/api/v1/auth/register", {
    body: { email, password, display_name: displayName },
  });
  if (error || !data) {
    if (response.status === 409) {
      throw new Error("email_in_use");
    }
    throw new Error("register_failed");
  }
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const { data, error, response } = await apiClient.POST("/api/v1/auth/login", {
    body: { email, password },
  });
  if (error || !data) {
    if (response.status === 429) {
      throw new Error("rate_limited");
    }
    if (response.status === 401) {
      throw new Error("invalid_credentials");
    }
    throw new Error("login_failed");
  }
  return data;
}

export async function logoutUser(): Promise<void> {
  await apiClient.POST("/api/v1/auth/logout");
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await apiClient.GET("/api/v1/auth/me");
  if (error || !data) {
    return null;
  }
  return data;
}

export async function refreshSession(): Promise<boolean> {
  const { error } = await apiClient.POST("/api/v1/auth/refresh");
  return !error;
}
