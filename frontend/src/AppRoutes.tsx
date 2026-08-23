import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomePage } from "./routes/HomePage";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
