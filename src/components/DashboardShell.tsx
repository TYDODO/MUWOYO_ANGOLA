<<<<<<< HEAD
import { ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChartArea,
  FileText,
=======
import { ReactNode, useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ChartArea,
  Building2,
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  Menu,
  Store,
  Star,
  ShoppingBag,
  CalendarDays,
  Boxes,
  ArrowRightLeft,
  PlayCircle,
  UsersRound,
  Truck,
  Wallet,
  CreditCard,
  KanbanSquare,
  Megaphone,
  Inbox as InboxIcon,
  Workflow,
  PanelLeft,
  LifeBuoy,
<<<<<<< HEAD
  MessageCircle,
  AudioLines,
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { supabase } from "@/integrations/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import ProfileSheet from "@/components/ProfileSheet";
import logo from "@/assets/muwoyo-logo.png";
import { trackMetaEvent } from "@/lib/meta-pixel";

<<<<<<< HEAD
const groups: {
  title: string;
  items: {
    title: string;
    to: string;
    icon: typeof ChartArea;
    permission?: string;
    ownerOnly?: boolean;
  }[];
}[] = [
  { title: "Principal", items: [{ title: "Dashboard", to: "/dashboard", icon: ChartArea }] },
  { title: "Operação comercial", items: [
    { title: "Inbox", to: "/inbox", icon: InboxIcon, permission: "inbox.view" },
    { title: "Informações do negócio", to: "/negocio", icon: FileText, ownerOnly: true },
=======
const groups = [
  { title: "Principal", items: [{ title: "Dashboard", to: "/dashboard", icon: ChartArea }] },
  { title: "Operação comercial", items: [
    { title: "Inbox", to: "/inbox", icon: InboxIcon, permission: "inbox.view" },
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
    { title: "CRM", to: "/crm", icon: KanbanSquare, permission: "crm.view" },
    { title: "Meus contactos", to: "/whatsapp", icon: UsersRound, permission: "contacts.view" },
    { title: "Pedidos", to: "/pedidos", icon: ShoppingBag, permission: "orders.view" },
    { title: "Entregadores", to: "/entregadores", icon: Truck, ownerOnly: true },
    { title: "Agendamentos", to: "/agenda", icon: CalendarDays, permission: "agenda.view" },
    { title: "Atendentes", to: "/equipa", icon: UsersRound, ownerOnly: true },
    { title: "Provas sociais", to: "/provas-sociais", icon: Star, ownerOnly: true },
    { title: "Transferido para humano", to: "/transferido-para-humano", icon: ArrowRightLeft, ownerOnly: true },
  ] },
  { title: "Crescimento", items: [
    { title: "Follow Up", to: "/follow-up", icon: Workflow, ownerOnly: true },
    { title: "Campanhas", to: "/campanhas", icon: Megaphone, permission: "campaigns.view" },
<<<<<<< HEAD
    { title: "Mensagens de Boas-Vindas", to: "/mensagens-boas-vindas", icon: MessageCircle, ownerOnly: true },
    { title: "Clonagem & Voz", to: "/voz", icon: AudioLines, ownerOnly: true },
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  ] },
  { title: "Catálogo", items: [
    { title: "Produtos", to: "/produtos", icon: Boxes, permission: "products.view" },
    { title: "Loja online", to: "/minha-loja", icon: Store, ownerOnly: true },
  ] },
<<<<<<< HEAD
=======
  { title: "Configuração", items: [
    { title: "Informações do negócio", to: "/negocio", icon: Building2, ownerOnly: true },
    { title: "Configurações", to: "/definicoes", icon: PanelLeft, ownerOnly: true },
  ] },
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  { title: "Conta", items: [
    { title: "Pagamentos", to: "/recargas", icon: CreditCard, ownerOnly: true },
    { title: "Faturação", to: "/faturacao", icon: Wallet, ownerOnly: true },
    { title: "Tutorial", to: "/tutorial", icon: PlayCircle, ownerOnly: true },
  ] },
];

<<<<<<< HEAD
function SidebarContent({ collapsed = false, planDaysRemaining, expiryLabel }: { collapsed?: boolean; planDaysRemaining: number | null; expiryLabel: string }) {
=======
type SidebarBadgeKey = "crm" | "orders" | "appointments" | "campaigns" | "followUp";
type SidebarCounts = Partial<Record<SidebarBadgeKey, number>>;

function SidebarContent({ collapsed = false, planDaysRemaining, expiryLabel, counts = {} }: { collapsed?: boolean; planDaysRemaining: number | null; expiryLabel: string; counts?: SidebarCounts }) {
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
              {visibleItems.map((item) => {
<<<<<<< HEAD
=======
                const badgeKey: SidebarBadgeKey | undefined =
                  item.to === "/crm" ? "crm"
                      : item.to === "/pedidos" ? "orders"
                        : item.to === "/agenda" ? "appointments"
                          : item.to === "/campanhas" ? "campaigns"
                            : item.to === "/follow-up" ? "followUp"
                              : undefined;
                const count = badgeKey ? counts[badgeKey] || 0 : 0;
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${isActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-accent"}`
                  }
                  title={collapsed ? item.title : undefined}
                >
<<<<<<< HEAD
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
=======
                  <span className="relative inline-flex">
                    <item.icon className="h-4 w-4" />
                    {collapsed && count > 0 && <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full border border-sidebar bg-emerald-500" />}
                  </span>
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
                  {!collapsed && count > 0 && <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">{count}</span>}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                </NavLink>
                );
              })}
            </section>
          );
        })}
        <a
          href="https://wa.me/244962011401"
          target="_blank"
          rel="noreferrer"
          onClick={() => trackMetaEvent("Contact")}
          className={`flex items-center gap-3 rounded-md py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent ${collapsed ? "justify-center px-2" : "px-3"}`}
          title={collapsed ? "Suporte" : undefined}
        >
          <LifeBuoy className="h-4 w-4" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">Suporte</span>}
        </a>
      </nav>
      <div className={`border-t border-sidebar-border ${collapsed ? "p-1" : "p-2"}`}>
        {!collapsed && planDaysRemaining !== null && (
          <div className={`mb-2 rounded-md border px-3 py-2 ${planDaysRemaining <= 7 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-background text-foreground"}`}>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Validade do plano</p>
            <p className="text-sm font-semibold">{planDaysRemaining === 0 ? "Plano expirado" : `${planDaysRemaining} ${planDaysRemaining === 1 ? "dia restante" : "dias restantes"}`}</p>
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
  mobileFullscreen = false,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  accountStatus?: string;
  wide?: boolean;
  mobileFullscreen?: boolean;
}) {
  const { user } = useAuth();
<<<<<<< HEAD
  const { membership } = useBusinessMembership();
=======
  const { ownerUserId, membership } = useBusinessMembership();
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  const isAttendant = membership?.role === "attendant";
  const [currentAccountStatus, setCurrentAccountStatus] = useState(accountStatus || "trial");
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
<<<<<<< HEAD
=======
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts>({});

  const loadSidebarCounts = useCallback(async () => {
    if (!user || !ownerUserId) {
      setSidebarCounts({});
      return;
    }

    const now = new Date().toISOString();
    const crmQuery = supabase
      .from("whatsapp_contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerUserId)
      .eq("is_group", false)
      .is("crm_viewed_at", null);

    const [crmResult, orderResult, appointmentResult, campaignResult, followUpResult] = await Promise.all([
      crmQuery,
      supabase.from("store_orders").select("id", { count: "exact", head: true }).eq("user_id", ownerUserId).in("status", ["new", "pending"]),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("user_id", ownerUserId).eq("status", "pending").gte("scheduled_at", now),
      supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", ownerUserId).in("status", ["scheduled", "processing", "sending"]),
      supabase.from("follow_up_jobs").select("id", { count: "exact", head: true }).eq("user_id", ownerUserId).eq("status", "pending").lte("due_at", now),
    ]);

    const counts: SidebarCounts = {
      crm: crmResult.count || 0,
      orders: orderResult.count || 0,
      appointments: appointmentResult.count || 0,
      campaigns: campaignResult.count || 0,
      followUp: followUpResult.count || 0,
    };
    const failed = [crmResult.error, orderResult.error, appointmentResult.error, campaignResult.error, followUpResult.error].filter(Boolean);
    if (failed.length) console.warn("Não foi possível atualizar todos os contadores do menu.", failed);
    setSidebarCounts(counts);
  }, [ownerUserId, user]);

  useEffect(() => {
    void loadSidebarCounts();
    if (!user || !ownerUserId) return;
    const channel = supabase
      .channel(`sidebar-counts-${ownerUserId}-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_contacts", filter: `user_id=eq.${ownerUserId}` }, () => void loadSidebarCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "store_orders", filter: `user_id=eq.${ownerUserId}` }, () => void loadSidebarCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `user_id=eq.${ownerUserId}` }, () => void loadSidebarCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `user_id=eq.${ownerUserId}` }, () => void loadSidebarCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_up_jobs", filter: `user_id=eq.${ownerUserId}` }, () => void loadSidebarCounts())
      .subscribe();
    const refresh = window.setInterval(() => void loadSidebarCounts(), 60_000);
    return () => {
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadSidebarCounts, ownerUserId, user]);

>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  useEffect(() => {
    if (!user || isAttendant) {
      setSubscriptionExpiresAt(null);
      setTrialExpiresAt(null);
      return;
    }
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
  }, [accountStatus, isAttendant, user]);

  const expiryTimestamp = isAttendant ? null : currentAccountStatus === "trial" ? trialExpiresAt : subscriptionExpiresAt;
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
<<<<<<< HEAD
        <SidebarContent collapsed={sidebarCollapsed} planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} />
=======
        <SidebarContent collapsed={sidebarCollapsed} planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} counts={sidebarCounts} />
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      </div>
      <div className={sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}>
        <header className={`${mobileFullscreen ? "hidden lg:block" : ""} sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur`}>
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-10">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
<<<<<<< HEAD
                  <SidebarContent planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} />
=======
                  <SidebarContent planDaysRemaining={planDaysRemaining} expiryLabel={expiryLabel} counts={sidebarCounts} />
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
                {!isAttendant && (
                  <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
                    <span>Status</span>
                    <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                    <span className="text-foreground">{statusLabel}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell hideTrialNotifications={isAttendant} />
            </div>
          </div>
        </header>
        <main className={`${wide ? "w-full" : "mx-auto max-w-7xl"} ${mobileFullscreen ? "space-y-0 px-0 py-0 lg:space-y-5 lg:px-10 lg:py-6" : "space-y-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-6"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
