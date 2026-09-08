import createClient from "openapi-fetch";
import type { paths } from "./schema.gen";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL, credentials: "include" });
