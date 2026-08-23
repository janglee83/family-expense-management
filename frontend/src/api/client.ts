import createClient from "openapi-fetch";
import type { paths } from "./schema.gen";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });
