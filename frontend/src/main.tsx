import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/i18n";
import "./styles.css";
import App from "./App";
import { applyThemePreference, getStoredThemePreference } from "./theme";

// Applied before the first paint so the page never flashes the wrong theme.
applyThemePreference(getStoredThemePreference());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
