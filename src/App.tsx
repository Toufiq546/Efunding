import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Home from "./pages/Home";
import Browse from "./pages/Browse";
import CampaignDetail from "./pages/CampaignDetail";
import CampaignForm from "./pages/CampaignForm";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import SetupNotice from "./pages/SetupNotice";
import { useStore } from "./lib/store";
import { isConfigured } from "./lib/supabase";
import type { Role } from "./lib/types";

function RequireRole({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useStore();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Login/register pages bounce signed-in users to their dashboard. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useStore();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  if (!isConfigured) return <SetupNotice />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="campaigns" element={<Browse />} />
        <Route path="campaigns/new" element={<RequireRole role="business"><CampaignForm /></RequireRole>} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="campaigns/:id/edit" element={<RequireRole role="business"><CampaignForm /></RequireRole>} />
        <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="dashboard" element={<RequireRole><Dashboard /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
