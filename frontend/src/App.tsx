import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";

export default function App() {
  return (
    <BrowserRouter>
      <SnackbarProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </SnackbarProvider>
    </BrowserRouter>
  );
}
