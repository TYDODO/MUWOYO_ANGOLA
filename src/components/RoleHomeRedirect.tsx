import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";

export default function RoleHomeRedirect({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, loading } = useRole();
  const { membership, loading: membershipLoading } = useBusinessMembership();

  console.log("RoleHomeRedirect debug - role:", role, "loading:", loading);

  if (loading || membershipLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  if (role === "admin") {
    console.log("RoleHomeRedirect - redirecionando para /admin");
    return <Navigate to="/admin" replace />;
  }
  if (role === "sub_admin") {
    console.log("RoleHomeRedirect - redirecionando para /gestor");
    return <Navigate to="/gestor" replace />;
  }
  if (membership?.role === "attendant") return <Navigate to="/atendente" replace />;
  console.log("RoleHomeRedirect - mantendo em /dashboard");
  return <>{children}</>;
}
