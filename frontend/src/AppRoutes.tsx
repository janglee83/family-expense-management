import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomePage } from "./routes/HomePage";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { FamilyList } from "./families/FamilyList";
import { FamilyDetail } from "./families/FamilyDetail";
import { ExpenseList } from "./expenses/ExpenseList";

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
      <Route
        path="/families"
        element={
          <ProtectedRoute>
            <FamilyList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/families/:familyId"
        element={
          <ProtectedRoute>
            <FamilyDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/families/:familyId/expenses"
        element={
          <ProtectedRoute>
            <ExpenseList />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
