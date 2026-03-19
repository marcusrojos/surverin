import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminDeliveries from "./pages/admin/Deliveries";
import AdminPharmacies from "./pages/admin/Pharmacies";
import AdminUsers from "./pages/admin/Users";
import AdminDriverTracking from "./pages/admin/DriverTracking";
import AdminLists from "./pages/admin/Lists";
import AdminAxes from "./pages/admin/Axes";
import AdminParcours from "./pages/admin/Parcours";
import DriverDashboard from "./pages/driver/Dashboard";
import PharmacyDashboard from "./pages/pharmacy/Dashboard";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
