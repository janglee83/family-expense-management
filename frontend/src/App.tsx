import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./api/queryClient";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SnackbarProvider>
          <AppRoutes />
        </SnackbarProvider>
      </BrowserRouter>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
