import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  ChartNoAxesCombined,
  ClipboardList,
  Coins,
  CreditCard,
  FlaskConical,
  LifeBuoy,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Workflow,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import ProfileSheet from "@/components/ProfileSheet";
import logo from "@/assets/muwoyo-logo.png";

type Period = "today" | "7d" | "30d" | "90d" | "month" | "previousMonth";
type NavigationItem = { title: string; to: string; icon: typeof BarChart3 };

const adminItems: NavigationItem[] = [
  { title: "Visão geral", to: "/admin", icon: BarChart3 },
  { title: "Utilizadores", to: "/admin/utilizadores", icon: Users },
  { title: "Clientes pagantes", to: "/admin/clientes-pagantes", icon: UserCheck },
  { title: "Planos e pacotes", to: "/admin/planos", icon: Package },
  { title: "Pagamentos e transações", to: "/admin/pagamentos", icon: CreditCard },
  { title: "Comprovativos e pagamentos", to: "/admin/comprovativos", icon: ClipboardList },
  { title: "Créditos e consumo", to: "/admin/tokens", icon: Coins },
  { title: "Testes gratuitos", to: "/admin/testes", icon: FlaskConical },
  { title: "Analytics e crescimento", to: "/admin/funil", icon: ChartNoAxesCombined },
  { title: "Distribuição geográfica", to: "/admin/geografia", icon: MapPin },
  { title: "Automações e WhatsApp", to: "/admin/automacoes", icon: Workflow },
  { title: "Custos de IA", to: "/admin/ai-custos", icon: MessageCircle },
  { title: "Tutoriais", to: "/admin/tutorials", icon: ClipboardList },
  { title: "Suporte", to: "/admin/suporte", icon: LifeBuoy },
  { title: "Notificações e incidentes", to: "/admin/notificacoes", icon: Bell },
  { title: "Subadmins e permissões", to: "/admin#subadmins", icon: ShieldCheck },
  { title: "Auditoria e segurança", to: "/admin/auditoria", icon: ClipboardList },
  { title: "Definições administrativas", to: "/admin/definicoes", icon: Settings },
];

const subItems: NavigationItem[] = [
  { title: "Visão geral", to: "/gestor", icon: BarChart3 },
  { title: "Cadastrar usuário", to: "/gestor/create-user", icon: Users },
  { title: "Meus usuários", to: "/gestor/users", icon: Users },
  { title: "Pagamentos", to: "/gestor/pagamentos", icon: CreditCard },
  { title: "Mensagem ao Admin", to: "/gestor/notify-admin", icon: Bell },
];

function Side({ mode }: { mode: "admin" | "sub" }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = mode === "admin" ? adminItems : subItems;

  return (
    <aside className="flex h-full w-[220px] flex-col border-r border-[#202b41] bg-[#10182a] text-slate-100">
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-[#202b41] px-5">
        <img src={logo} alt="Muwoyo" className="h-9 w-9 object-contain" />
        <div className="min-w-0">
          <div className="text-sm font-bold">MUWOYO</div>
          <div className="text-xs text-slate-400">Painel administrativo</div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {items.map((item) => (
          <NavLink
            key={item.title}
            to={item.to}
            end={item.to === (mode === "admin" ? "/admin" : "/gestor") || item.to.startsWith("/admin#")}
            className={({ isActive }) => {
              const active = item.to.includes("#")
                ? `${location.pathname}${location.hash}` === item.to
                : isActive && !(item.to === "/admin" && location.hash);
              return `flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${active ? "bg-[#3948a8] text-white" : "text-slate-300 hover:bg-[#1b2740] hover:text-white"}`;
            }}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 border-t border-[#202b41] p-3">
        <ProfileSheet>
          <button className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-[#1b2740]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3948a8] text-sm font-semibold text-white">{(user?.email || "A").slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{mode === "admin" ? "Administrador Principal" : "Gestor"}</div>
              <div className="truncate text-[11px] text-slate-400">{user?.email}</div>
            </div>
            <span aria-label="Conta ativa" className="h-2 w-2 rounded-full bg-emerald-400" />
          </button>
        </ProfileSheet>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-slate-300 hover:bg-[#1b2740] hover:text-white" onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}>
          <LogOut className="h-4 w-4" />Terminar sessão
        </Button>
      </div>
      <div className="border-t border-[#202b41] px-5 py-3 text-[11px] text-slate-500">MUWOYO · Painel Administrativo</div>
    </aside>
  );
}

export default function AdminShell({
  children,
  title,
  mode,
  search,
  onSearch,
  description,
  period,
  onPeriodChange,
  onRefresh,
}: {
  children: ReactNode;
  title: string;
  mode: "admin" | "sub";
  search?: string;
  onSearch?: (value: string) => void;
  description?: string;
  period?: Period;
  onPeriodChange?: (period: Period) => void;
  onRefresh?: () => void;
}) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#f4f6fa] text-[#172033]">
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block"><Side mode={mode} /></div>
      <div className="lg:pl-[220px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Sheet>
                <SheetTrigger asChild><Button variant="ghost" size="icon" className="shrink-0 lg:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger>
                <SheetContent side="left" className="w-[220px] border-0 p-0"><Side mode={mode} /></SheetContent>
              </Sheet>
              {onSearch && <div className="relative w-full max-w-[500px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search || ""} onChange={(event) => onSearch(event.target.value)} placeholder="Pesquisar utilizadores, emails, transações..." className="h-9 border-slate-200 bg-slate-50 pl-9 text-sm" />
              </div>}
            </div>
            <div className="flex items-center gap-2">
              {onPeriodChange && <Select value={period} onValueChange={(value) => onPeriodChange(value as Period)}>
                <SelectTrigger className="h-9 w-[142px] border-slate-200 bg-white text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem><SelectItem value="90d">Últimos 90 dias</SelectItem><SelectItem value="month">Este mês</SelectItem><SelectItem value="previousMonth">Mês anterior</SelectItem>
                </SelectContent>
              </Select>}
              {onRefresh && <Button variant="outline" size="sm" className="h-9 gap-2 border-slate-200" onClick={onRefresh}><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Atualizar</span></Button>}
              <NotificationBell />
              <ProfileSheet>
                <button className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50 sm:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800">A</span>
                  <span className="hidden xl:block"><span className="block text-xs font-semibold">Administrador Principal</span><span className="block max-w-36 truncate text-[11px] text-slate-500">{user?.email}</span></span>
                </button>
              </ProfileSheet>
            </div>
          </div>
        </header>
        <main className={`mx-auto space-y-5 px-4 py-5 sm:px-6 ${mode === "admin" ? "max-w-[1600px]" : "max-w-7xl"}`}>
          <div>
            <h1 className="text-xl font-semibold text-[#172033]">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{description || "Gestão profissional Muwoyo"}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
