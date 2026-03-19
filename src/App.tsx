import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Eager load critical routes
import Index from "./pages/Index";
import Login from "./pages/Login";

// Lazy load all dashboard routes
const Setup = lazy(() => import("./pages/Setup"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminDeliveries = lazy(() => import("./pages/admin/Deliveries"));
const AdminPharmacies = lazy(() => import("./pages/admin/Pharmacies"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminDriverTracking = lazy(() => import("./pages/admin/DriverTracking"));
const AdminLists = lazy(() => import("./pages/admin/Lists"));
const AdminAxes = lazy(() => import("./pages/admin/Axes"));
const AdminParcours = lazy(() => import("./pages/admin/Parcours"));
const DriverDashboard = lazy(() => import("./pages/driver/Dashboard"));
const PharmacyDashboard = lazy(() => import("./pages/pharmacy/Dashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Install = lazy(() => import("./pages/Install"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes, don't refetch on window focus
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      retry: 1, // Max 1 retry (2 attempts total)
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/deliveries" element={<AdminDeliveries />} />
              <Route path="/admin/pharmacies" element={<AdminPharmacies />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/tracking" element={<AdminDriverTracking />} />
              <Route path="/admin/lists" element={<AdminLists />} />
              <Route path="/admin/axes" element={<AdminAxes />} />
              <Route path="/admin/parcours" element={<AdminParcours />} />
              <Route path="/driver" element={<DriverDashboard />} />
              <Route path="/pharmacy" element={<PharmacyDashboard />} />
              <Route path="/install" element={<Install />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
