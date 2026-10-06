import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleRoute from "@/components/RoleRoute";
import OnboardingGate from "@/components/OnboardingGate";
import CreditGate from "@/components/CreditGate";
import RoleHomeRedirect from "@/components/RoleHomeRedirect";
import Login from "./pages/Login";
import Register from "./pages/Register";
import EmailVerification from "./pages/EmailVerification";
import PasswordRecovery from "./pages/PasswordRecovery";
import Dashboard from "./pages/Dashboard";
import BusinessInfo from "./pages/BusinessInfo";
import MyWhatsApp from "./pages/MyWhatsApp";
import StoreManagement from "./pages/StoreManagement";
import MyProducts from "./pages/MyProducts";
import PublicStore from "./pages/PublicStore";
import MessageTopUp from "./pages/MessageTopUp";
import Orders from "./pages/Orders";
import Schedule from "./pages/Schedule";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTokens from "./pages/AdminTokens";
import AdminTutorials from "./pages/AdminTutorials";
import AdminAffiliatesPage from "./pages/AdminAffiliates";
import AdminPayments from "./pages/AdminPayments";
import HumanTransfers from "./pages/HumanTransfers";
import Tutorial from "./pages/Tutorial";
import AffiliatesPage from "./pages/Affiliates";
import SubAdminDashboard from "./pages/SubAdminDashboard";
import NotFound from "./pages/NotFound.tsx";
import LandingPageMWY from "../LandingPageMWY";
import SubAdminCreateUser from "./pages/subadmin/CreateUser";
import SubAdminUsers from "./pages/subadmin/Users";
import SubAdminNotifyAdmin from "./pages/subadmin/NotifyAdmin";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfUse } from "./pages/TermsOfUse";
import { PrivacyPolicyViewer } from "./pages/PrivacyPolicyViewer";
import { TermsOfUseViewer } from "./pages/TermsOfUseViewer";
import PwaLaunchGate from "./components/PwaLaunchGate";
import SettingsPage from "./pages/Settings";
import Billing from "./pages/Billing";
import CRM from "./pages/CRM";
import Campaigns from "./pages/Campaigns";
import FollowUp from "./pages/FollowUp";
import Inbox from "./pages/Inbox";
import TeamMembers from "./pages/TeamMembers";
import AttendantDashboard from "./pages/AttendantDashboard";

const queryClient = new QueryClient();
const protectedPage = (page: JSX.Element) => (
  <ProtectedRoute>
    <CreditGate>
      <OnboardingGate>{page}</OnboardingGate>
    </CreditGate>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <PwaLaunchGate>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/criar-conta" element={<Register />} />
            <Route path="/confirmar-email" element={<EmailVerification />} />
            <Route path="/recuperar-password" element={<PasswordRecovery />} />
            <Route path="/loja/:slug" element={<PublicStore />} />
            <Route path="/" element={<LandingPageMWY />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <RoleHomeRedirect>
                    <CreditGate>
                      <OnboardingGate><Dashboard /></OnboardingGate>
                    </CreditGate>
                  </RoleHomeRedirect>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <RoleRoute allow={["admin"]}>
                  <AdminDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/tokens"
              element={
                <RoleRoute allow={["admin"]}>
                  <AdminTokens />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/tutorials"
              element={
                <RoleRoute allow={["admin"]}>
                  <AdminTutorials />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/afiliados"
              element={
                <RoleRoute allow={["admin"]}>
                  <AdminAffiliatesPage />
                </RoleRoute>
              }
            />
            <Route path="/admin/pagamentos" element={<RoleRoute allow={["admin"]}><AdminPayments /></RoleRoute>} />
            <Route path="/gestor/pagamentos" element={<RoleRoute allow={["sub_admin"]}><AdminPayments mode="sub" /></RoleRoute>} />
            <Route
              path="/gestor"
              element={
                <RoleRoute allow={["sub_admin"]}>
                  <SubAdminDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/gestor/create-user"
              element={
                <RoleRoute allow={["sub_admin"]}>
                  <SubAdminCreateUser />
                </RoleRoute>
              }
            />
            <Route
              path="/gestor/users"
              element={
                <RoleRoute allow={["sub_admin"]}>
                  <SubAdminUsers />
                </RoleRoute>
              }
            />
            <Route
              path="/gestor/notify-admin"
              element={
                <RoleRoute allow={["sub_admin"]}>
                  <SubAdminNotifyAdmin />
                </RoleRoute>
              }
            />
            <Route path="/negocio" element={protectedPage(<BusinessInfo />)} />
            <Route path="/whatsapp" element={protectedPage(<MyWhatsApp />)} />
            <Route path="/pedidos" element={protectedPage(<Orders />)} />
            <Route path="/atendente" element={protectedPage(<AttendantDashboard />)} />
            <Route path="/agenda" element={protectedPage(<Schedule />)} />
            <Route
              path="/transferido-para-humano"
              element={protectedPage(<HumanTransfers />)}
            />
            <Route
              path="/minha-loja"
              element={protectedPage(<StoreManagement />)}
            />
            <Route path="/produtos" element={protectedPage(<MyProducts />)} />
            <Route path="/afiliados" element={protectedPage(<AffiliatesPage />)} />
            <Route path="/definicoes" element={protectedPage(<SettingsPage />)} />
            <Route path="/equipa" element={protectedPage(<TeamMembers />)} />
            <Route path="/faturacao" element={protectedPage(<Billing />)} />
            <Route path="/crm" element={protectedPage(<CRM />)} />
            <Route path="/campanhas" element={protectedPage(<Campaigns />)} />
            <Route path="/follow-up" element={protectedPage(<FollowUp />)} />
            <Route path="/inbox" element={protectedPage(<Inbox />)} />
            <Route path="/tutorial" element={protectedPage(<Tutorial />)} />
            <Route
              path="/recargas"
              element={
                <ProtectedRoute>
                  <OnboardingGate>{<MessageTopUp />}</OnboardingGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/politica-privacidade"
              element={<PrivacyPolicyViewer />}
            />
            <Route path="/termos-uso" element={<TermsOfUseViewer />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </PwaLaunchGate>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
