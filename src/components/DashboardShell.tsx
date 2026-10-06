import { ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChartArea,
  Building2,
  Menu,
  Store,
  Gift,
  ShoppingBag,
  CalendarDays,
  Boxes,
  ArrowRightLeft,
  PlayCircle,
  UsersRound,
  Wallet,
  CreditCard,
  KanbanSquare,
  Megaphone,
  Inbox as InboxIcon,
  Workflow,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { supabase } from "@/integrations/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import ProfileSheet from "@/components/ProfileSheet";
import logo from "@/assets/muwoyo-logo.png";

const groups = [
  { title: "Principal", items: [{ title: "Dashboard", to: "/dashboard", icon: ChartArea }] },
  { title: "Operação comercial", items: [
    { title: "Inbox", to: "/inbox", icon: InboxIcon, permission: "inbox.view" },
    { title: "CRM", to: "/crm", icon: KanbanSquare, permission: "crm.view" },
    { title: "Meus contactos", to: "/whatsapp", icon: UsersRound, permission: "contacts.view" },
    { title: "Pedidos", to: "/pedidos", icon: ShoppingBag, permission: "orders.view" },
    { title: "Agendamentos", to: "/agenda", icon: CalendarDays, permission: "agenda.view" },
    { title: "Transferido para humano", to: "/transferido-para-humano", icon: ArrowRightLeft, ownerOnly: true },
  ] },
  { title: "Crescimento", items: [
    { title: "Follow Up", to: "/follow-up", icon: Workflow, ownerOnly: true },
    { title: "Campanhas", to: "/campanhas", icon: Megaphone, ownerOnly: true },
  ] },
  { title: "Catálogo", items: [
    { title: "Produtos", to: "/produtos", icon: Boxes, permission: "products.view" },
    { title: "Loja online", to: "/minha-loja", icon: Store, ownerOnly: true },
  ] },
  { title: "Configuração", items: [
    { title: "Informações do negócio", to: "/negocio", icon: Building2, ownerOnly: true },
    { title: "Atendentes", to: "/equipa", icon: UsersRound, ownerOnly: true },
    { title: "Configurações", to: "/definicoes", icon: PanelLeft, ownerOnly: true },
  ] },
  { title: "Conta", items: [
    { title: "Afiliados", to: "/afiliados", icon: Gift, ownerOnly: true },
    { title: "Pagamentos", to: "/recargas", icon: CreditCard, ownerOnly: true },
    { title: "Faturação", to: "/faturacao", icon: Wallet, ownerOnly: true },
    { title: "Tutorial", to: "/tutorial", icon: PlayCircle, ownerOnly: true },
  ] },
];

function SidebarContent({ collapsed = false, planDaysRemaining, expiryLabel }: { collapsed?: boolean; planDaysRemaining: number | null; expiryLabel: string }) {
  const { user } = useAuth();
  const { isOwner, hasPermission, loading: membershipLoading } = useBusinessMembership();
  return (
    <aside className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] ${collapsed ? "w-16" : "w-60"}`}>
      <div className={`flex h-20 items-center gap-3 ${collapsed ? "justify-center px-2" : "px-6"}`}>
        <img src={logo} alt="Muwoyo" className="h-10 w-10 object-contain" />
        {!collapsed && <div className="text-2xl font-bold text-foreground">Muwoyo</div>}
      </div>
      <nav className={`flex-1 space-y-3 overflow-y-auto py-3 ${collapsed ? "px-1" : "px-3"}`}>
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) =>
            isOwner || (!membershipLoading && !item.ownerOnly && (!item.permission || hasPermission(item.permission))),
          );
          if (!visibleItems.length) return null;
          return (
            <section key={group.title} className="space-y-0.5">
              {!collapsed && <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">{group.title}</h2>}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${isActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-accent"}`
                  }
                  title={collapsed ? item.title : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              ))}
            </section>
          );
        })}
      </nav>
      <div className={`border-t border-sidebar-border ${collapsed ? "p-1" : "p-2"}`}>
        {!collapsed && planDaysRemaining !== null && (
          <div className={`mb-2 rounded-md border px-3 py-2 ${planDaysRemaining <= 7 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-background text-foreground"}`}>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Validade do plano</p>
            <p className="text-sm font-semibold">{planDaysRemaining} {planDaysRemaining === 1 ? "dia restante" : "dias restantes"}</p>
            <p className="text-[10px] text-muted-foreground">{expiryLabel}</p>
          </div>
        )}
        <ProfileSheet>
          <button className={`flex w-full items-center gap-3 rounded-md bg-accent p-3 text-left transition-colors hover:bg-accent/80 ${collapsed ? "justify-center" : ""}`} title={collapsed ? user?.email || "Perfil" : undefined}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {(user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {user?.email?.split("@")[0] || "Usuário"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user?.email}
              </div>
            </div>}
          </button>
        </ProfileSheet>
      </div>
    </aside>
  );
}

export default function DashboardShell({
  children,
  title,
  description,
  accountStatus,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  accountStatus?: string;
  wide?: boolean;
}) {
  const { user } = useAuth();
  const [currentAccountStatus, setCurrentAccountStatus] = useState(accountStatus || "trial");
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("account_status,subscription_expires_at,trial_expires_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setCurrentAccountStatus(data?.account_status || accountStatus || "trial");
        setSubscriptionExpiresAt(data?.subscription_expires_at || null);
        setTrialExpiresAt(data?.trial_expires_at || null);
      });
  }, [accountStatus, user]);

  const expiryTimestamp = currentAccountStatus === "trial" ? trialExpiresAt : subscriptionExpiresAt;
  const planDaysRemaining = expiryTimestamp
    ? Math.max(0, Math.ceil((new Date(expiryTimestamp).getTime() - Date.now()) / 86400000))
    : null;
  const expiryLabel = expiryTimestamp
    ? `Expira em ${new Date(expiryTimestamp).toLocaleDateString("pt-AO")}`
    : "Sem data de expiração";

  const statusLabel = currentAccountStatus === "trial"
    ? "Em teste"
    : currentAccountStatus === "awaiting_activation"
      ? "Pagamento confirmado"
      : "Ativa";
  const statusColor = currentAccountStatus === "trial"
    ? "bg-amber-400"
    : currentAccountStatus === "awaiting_activation"
      ? "bg-sky-500"
      : "bg-emerald-500";

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">
        <SidebarContent collapsed={sidebarCollapsed} planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} />
      </div>
      <div className={sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}>
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-10">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SidebarContent planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} />
                </SheetContent>
              </Sheet>
              <div className="flex items-center gap-3 lg:gap-0">
                <img
                  src={logo}
                  alt="Muwoyo"
                  className="h-8 w-8 object-contain lg:hidden"
                />
                <div>
                  <h1 className="text-lg font-bold tracking-normal text-foreground lg:text-2xl">
                    {title}
                  </h1>
                  {description && (
                    <p className="hidden text-sm text-muted-foreground sm:block">
                      {description}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="hidden lg:inline-flex" title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} onClick={() => setSidebarCollapsed((value) => !value)}>
                  <PanelLeft className="h-4 w-4" />
                </Button>
                <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
                  <span>Status</span>
                  <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                  <span className="text-foreground">{statusLabel}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </div>
        </header>
        <main className={`${wide ? "w-full" : "mx-auto max-w-7xl"} space-y-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-6`}>
          {children}
        </main>
      </div>
    </div>
  );
}
