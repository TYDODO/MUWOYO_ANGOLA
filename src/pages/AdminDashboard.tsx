import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Bell,
  CalendarDays,
  Coins,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageSquarePlus,
  Package,
  RefreshCw,
  Shield,
  CheckCircle2,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import UserGrowthChart from "@/components/UserGrowthChart";
import { useAuth } from "@/hooks/useAuth";
import { buildAdminDashboardMetrics, type RangeKey } from "@/lib/admin-dashboard-metrics";

type Row = {
  user_id: string;
  full_name: string | null;
  email?: string | null;
  phone: string | null;
  status: string | null;
  is_suspended: boolean | null;
  message_limit: number | null;
  messages_received: number | null;
  created_at: string | null;
  created_by: string | null;
  business_name: string | null;
  account_status?: string | null;
  trial_started_at?: string | null;
  trial_expires_at?: string | null;
  subscription_expires_at?: string | null;
  has_valid_subscription?: boolean;
  acquisition_source?: string | null;
  province?: string | null;
  plan_id?: string | null;
  instances?: { instance_name?: string | null }[];
  role?: string;
};
type ActivityRow = { id: string; title: string; message: string; type: string; created_at: string; link: string | null };
type TopUpRow = { id: string; amount_kz: number; status: string; request_type: string; created_at: string; confirmed_at: string | null; approved_at: string | null };
type ChartPoint = { key: string; label: string; registered: number; active: number; revenue: number };
const sb = supabase as any;
const isOperationalUser = (user: Row) => {
  if (user.is_suspended || user.status === "suspended") return false;
  if (user.has_valid_subscription) return true;
  if (user.account_status === "active") return !user.subscription_expires_at || new Date(user.subscription_expires_at).getTime() > Date.now();
  return user.account_status === "trial" && Boolean(user.trial_started_at) && (!user.trial_expires_at || new Date(user.trial_expires_at).getTime() > Date.now());
};

export default function AdminDashboard() {
  const { user: adminUser } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Row[]>([]);
  const [subs, setSubs] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState<RangeKey>("30d");
  const [metrics, setMetrics] = useState(() => buildAdminDashboardMetrics({ profiles: [], subscriptions: [], instances: [], range: "30d" }));
  const [plans, setPlans] = useState<{ id: string; name: string; price_kz: number }[]>([]);
  const [topUps, setTopUps] = useState<TopUpRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [instanceRows, setInstanceRows] = useState<any[]>([]);
  const [dashboardProfiles, setDashboardProfiles] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [notice, setNotice] = useState({
    title: "",
    message: "",
    linkUrl: "",
    imageUrl: "",
    documentUrl: "",
    targets: { clients: true, sub_admin: false, admin: false },
    specificUserId: "",
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [edit, setEdit] = useState<Row | null>(null);
  const [msg, setMsg] = useState({ userId: "", amount: "" });
  const [editLimit, setEditLimit] = useState<{ userId: string; limit: string }>({ userId: "", limit: "" });
  const [planNames, setPlanNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!adminUser || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(`muwoyo-admin-panel-${adminUser.id}`);
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      if (typeof state.search === "string") setSearch(state.search);
      if (typeof state.filter === "string") setFilter(state.filter);
    } catch {
      window.localStorage.removeItem(`muwoyo-admin-panel-${adminUser.id}`);
    }
  }, [adminUser]);

  useEffect(() => {
    if (!adminUser || typeof window === "undefined") return;
    window.localStorage.setItem(`muwoyo-admin-panel-${adminUser.id}`, JSON.stringify({ search, filter }));
  }, [adminUser, search, filter]);
  
  const load = async (nextRange: RangeKey = range) => {
    const [profileResult, subscriptionResult, instanceResult, roleResult, topUpResult, activityResult] = await Promise.all([
      sb.from("profiles").select(
        "user_id,full_name,email,phone,status,is_suspended,message_limit,messages_received,created_at,created_by,business_name,account_status,trial_started_at,trial_expires_at,acquisition_source,plan_id,subscription_expires_at,onboarding_completed,province",
      ).order("created_at", { ascending: false }),
      sb.from("plan_subscriptions").select("user_id,plan_id,status,confirmed_at,submitted_at,expires_at,amount_kz").order("confirmed_at", { ascending: false }),
      sb.from("instances").select("user_id,status,connection_state,automation_paused").order("updated_at", { ascending: false }),
      sb.from("user_roles").select("user_id,role"),
      sb.from("top_up_requests").select("id,amount_kz,status,request_type,created_at,confirmed_at,approved_at").order("created_at", { ascending: false }),
      sb.from("notifications").select("id,title,message,type,created_at,link").order("created_at", { ascending: false }).limit(6),
    ]);
    const { data: profiles, error: profilesError } = profileResult;
    const { data: subscriptions, error: subscriptionsError } = subscriptionResult;
    const { data: instances, error: instancesError } = instanceResult;
    const { data: roles, error: rolesError } = roleResult;
    const { data: topUpRows, error: topUpsError } = topUpResult;
    const { data: activityRows, error: activityError } = activityResult;
    const failedQueries = [profilesError, subscriptionsError, instancesError, rolesError, topUpsError, activityError].filter(Boolean);
    setLoadError(failedQueries.length ? failedQueries.map((query: any) => query.message).join(" · ") : "");
    const pricedSubscriptions = subscriptions || [];

    const activeSubscriptionIds = new Set((subscriptions || []).filter((subscription: any) => subscription.status === "active" && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now())).map((subscription: any) => subscription.user_id));
    const roleMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
    const rows = (profiles || []).map((p: Row) => ({
      ...p,
      role: roleMap.get(p.user_id) || "client",
      has_valid_subscription: activeSubscriptionIds.has(p.user_id),
    }));

    setDashboardProfiles(rows);
    setPlans((planRows || []).map((plan: any) => ({ ...plan, price_kz: Number(plan.price_kz || 0) })));
    setTopUps((topUpRows || []).map((row: TopUpRow) => ({ ...row, amount_kz: Number(row.amount_kz || 0) })));
    setActivity(activityRows || []);
    setInstanceRows(instances || []);
    setPlanNames(Object.fromEntries((planRows || []).map((plan: any) => [plan.id, plan.name])));
    setUsers(rows.filter((r: Row) => r.role === "client"));
    setSubs(rows.filter((r: Row) => r.role === "sub_admin"));
    setMetrics(
      buildAdminDashboardMetrics({
        profiles: profiles || [],
        subscriptions: pricedSubscriptions,
        instances: instances || [],
        range: nextRange,
      }),
    );
  };

  useEffect(() => {
    void load(range);
  }, [range]);

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return;
    requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.hash]);
  const filtered = users
    .filter((u) =>
      filter === "active"
        ? isOperationalUser(u)
        : filter === "inactive"
          ? !isOperationalUser(u)
        : filter === "suspended"
          ? u.is_suspended || u.status === "suspended"
          : filter === "empty"
            ? Number(u.message_limit || 0) - Number(u.messages_received || 0) <=
              0
            : filter === "trial"
                ? u.account_status === "trial" && Boolean(u.trial_started_at) && (!u.trial_expires_at || new Date(u.trial_expires_at).getTime() > Date.now())
              : filter === "awaiting_activation"
                ? u.account_status === "awaiting_activation"
                : filter === "commercial_active"
                  ? Boolean(u.has_valid_subscription || u.account_status === "active" && (!u.subscription_expires_at || new Date(u.subscription_expires_at).getTime() > Date.now()))
            : true,
    )
    .filter((u) =>
      `${u.full_name || ""} ${u.phone || ""} ${u.business_name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const call = async (body: any) => {
    try {
      const { error, data } = await supabase.functions.invoke("admin-users", {
        body,
      });
      if (error || data?.error) {
        console.warn(
          "Function admin-users not available:",
          error?.message || data?.error,
        );
        toast({
          title: "Erro",
          description: error?.message || data?.error,
          variant: "destructive",
        });
        return false;
      }
      toast({ title: "Concluído" });
      load();
      return true;
    } catch (error) {
      console.warn("Function call failed:", error);
      toast({
        title: "Erro crítico",
        description: "Erro ao conectar com o servidor",
        variant: "destructive",
      });
      return false;
    }
  };
  const create = async (e: FormEvent, sub = false) => {
    e.preventDefault();
    if (
      await call({ action: sub ? "createSubadmin" : "createUser", ...form })
    ) {
      setForm({ name: "", email: "", phone: "", password: "" });
      setCreateOpen(false);
      setSubOpen(false);
    }
  };
  const active = users.filter(isOperationalUser).length,
    suspended = users.length - active,
    empty = users.filter(
      (u) =>
        Number(u.message_limit || 0) - Number(u.messages_received || 0) <= 0,
    ).length,
    trial = users.filter((u) => u.account_status === "trial" && Boolean(u.trial_started_at) && (!u.trial_expires_at || new Date(u.trial_expires_at).getTime() > Date.now())).length,
    awaitingActivation = users.filter((u) => u.account_status === "awaiting_activation").length,
    commercialActive = users.filter((u) => u.has_valid_subscription || u.account_status === "active" && (!u.subscription_expires_at || new Date(u.subscription_expires_at).getTime() > Date.now())).length;
  const submitNotice = async (e: FormEvent) => {
    e.preventDefault();
    const targetRoles = Object.entries(notice.targets)
      .filter(([, v]) => v)
      .map(([k]) => (k === "clients" ? "client" : k));
    if (notice.specificUserId) {
      await call({
        action: "sendNotification",
        title: notice.title,
        message: notice.message,
        userId: notice.specificUserId,
        link: notice.linkUrl || null,
        image_url: notice.imageUrl || null,
      });
    } else {
      for (const r of targetRoles) {
        await call({
          action: "sendNotification",
          title: notice.title,
          message: notice.message,
          targetRole: r,
          link: notice.linkUrl || null,
          image_url: notice.imageUrl || null,
        });
      }
    }
    setNotice({
      title: "",
      message: "",
      linkUrl: "",
      imageUrl: "",
      documentUrl: "",
      targets: { clients: true, sub_admin: false, admin: false },
      specificUserId: "",
    });
  };
  const uploadImage = async (file: File) => {
    const path = `notif/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("notification-images")
      .upload(path, file);
    if (error)
      return toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    const { data } = supabase.storage
      .from("notification-images")
      .getPublicUrl(path);
    setNotice((n) => ({ ...n, imageUrl: data.publicUrl }));
    toast({ title: "Imagem carregada" });
  };
  const allMatches = search.trim()
    ? [...users, ...subs].filter((u) =>
        `${u.full_name || ""} ${u.phone || ""} ${u.business_name || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : [];
  const allUsersForSelect = [...users, ...subs];
  return (
    <AdminShell
      mode="admin"
      title="Muwoyo Admin"
      search={search}
      onSearch={setSearch}
    >
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Painel administrativo</p>
          <h2 className="text-lg font-semibold">Indicadores reais por período</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Período</span>
          <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="previousMonth">Mês anterior</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Utilizadores registados" value={metrics.totalUsers} icon={<Users />} onClick={() => setFilter("all")} />
        <Stat label="Novos registos" value={metrics.newUsers} icon={<UserPlus />} onClick={() => setFilter("all")} />
        <Stat label="Utilizadores ativos" value={metrics.activeUsers} icon={<CheckCircle2 />} onClick={() => setFilter("active")} />
        <Stat label="Utilizadores inativos" value={metrics.inactiveUsers} icon={<Ban />} onClick={() => setFilter("inactive")} />
        <Stat label="Configuração concluída" value={metrics.onboardingCompleted} icon={<Shield />} onClick={() => setFilter("all")} />
        <Stat label="WhatsApp ligados" value={metrics.connectedWhatsApp} icon={<MessageSquarePlus />} onClick={() => setFilter("all")} />
        <Stat label="Automação operacional" value={metrics.automationOperational} icon={<RefreshCw />} onClick={() => setFilter("all")} />
        <Stat label="Em teste gratuito" value={metrics.trialUsers} icon={<Users />} onClick={() => setFilter("trial")} />
        <Stat label="Clientes pagantes" value={metrics.paidCustomers} icon={<Wallet />} onClick={() => setFilter("all")} />
        <Stat label="Recompra" value={metrics.repeatBuyers} icon={<Coins />} onClick={() => setFilter("all")} />
        <Stat label="Créditos esgotados" value={metrics.creditDepleted} icon={<MessageSquarePlus />} onClick={() => setFilter("empty")} />
        <Stat label="Faturamento confirmado dos planos" value={`${metrics.confirmedPlanRevenue.toLocaleString("pt-AO")} Kz`} icon={<Coins />} onClick={() => setFilter("all")} />
      </div>
      {search.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Resultados da pesquisa: "{search}" ({allMatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {allMatches.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhum resultado.
              </div>
            )}
            {allMatches.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {u.full_name || u.business_name || "Usuário"}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({u.role})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    +{u.phone || ""} · {u.business_name || ""} · ID{" "}
                    {u.user_id.slice(0, 8)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEdit(u)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMsg({ userId: u.user_id, amount: "" })}
                  >
                    Mensagens
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Cadastrar usuário
            </Button>
          </DialogTrigger>
          <UserDialog
            title="Cadastrar usuário"
            form={form}
            setForm={setForm}
            onSubmit={(e) => create(e, false)}
          />
        </Dialog>
        <Dialog open={subOpen} onOpenChange={setSubOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Shield className="mr-2 h-4 w-4" />
              Cadastrar subadmin
            </Button>
          </DialogTrigger>
          <UserDialog
            title="Cadastrar subadmin"
            form={form}
            setForm={setForm}
            onSubmit={(e) => create(e, true)}
          />
        </Dialog>
        <Button variant="ghost" onClick={() => setFilter("all")}>
          Limpar filtro
        </Button>
        <Button variant="outline" onClick={load}>
          Atualizar
        </Button>
      </div>
      <UserGrowthChart rows={users} title="Crescimento de usuários" />
      <UserTable
        title="Todos os usuários"
        rows={filtered}
        planNames={planNames}
        onEdit={setEdit}
        onMsg={(u) => setMsg({ userId: u.user_id, amount: "" })}
        onEditLimit={(u) => setEditLimit({ userId: u.user_id, limit: String(u.message_limit || 0) })}
        onSuspend={(u) =>
          call({
            action: "suspendUser",
            userId: u.user_id,
            suspended: !(u.is_suspended || u.status === "suspended"),
          })
        }
        onDelete={(u) => window.confirm(`Tem certeza que deseja eliminar ${u.full_name || "este usuário"}?`) && call({ action: "deleteUser", userId: u.user_id })}
      />
      <div id="subadmins" className="scroll-mt-24">
      <UserTable
        title="Subadmins"
        rows={subs.filter((s) =>
          `${s.full_name || ""} ${s.phone || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )}
        planNames={planNames}
        onEdit={setEdit}
        onMsg={() => {}}
        onEditLimit={(u) => setEditLimit({ userId: u.user_id, limit: String(u.message_limit || 0) })}
        onSuspend={(u) =>
          call({
            action: "suspendUser",
            userId: u.user_id,
            suspended: !(u.is_suspended || u.status === "suspended"),
          })
        }
        onDelete={(u) => window.confirm(`Tem certeza que deseja eliminar ${u.full_name || "este usuário"}?`) && call({ action: "deleteUser", userId: u.user_id })}
      />
      </div>
      
      <Card id="notifications" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Enviar notificação em massa</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={submitNotice}>
            <Input
              required
              placeholder="Título"
              value={notice.title}
              onChange={(e) => setNotice({ ...notice, title: e.target.value })}
            />
            <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm md:col-span-1">
              <span className="text-muted-foreground">Enviar para:</span>
              {[
                ["clients", "Clientes"],
                ["sub_admin", "Subadmins"],
                ["admin", "Admins"],
              ].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={(notice.targets as any)[k]}
                    onChange={(e) =>
                      setNotice({
                        ...notice,
                        targets: { ...notice.targets, [k]: e.target.checked },
                      })
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
            <Select
              value={notice.specificUserId}
              onValueChange={(v) =>
                setNotice({
                  ...notice,
                  specificUserId: v === "__none__" ? "" : v,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="OU escolher usuário específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  - Nenhum (usar lista acima) -
                </SelectItem>
                {allUsersForSelect.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name ||
                      u.business_name ||
                      u.phone ||
                      u.user_id.slice(0, 8)}{" "}
                    ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Link opcional"
              value={notice.linkUrl}
              onChange={(e) =>
                setNotice({ ...notice, linkUrl: e.target.value })
              }
            />
            <div className="flex items-center gap-2">
              <Input
                placeholder="Imagem URL ou carregar"
                value={notice.imageUrl}
                onChange={(e) =>
                  setNotice({ ...notice, imageUrl: e.target.value })
                }
              />
              <label className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                Carregar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    e.target.files?.[0] && uploadImage(e.target.files[0])
                  }
                />
              </label>
            </div>
            <Textarea
              required
              className="md:col-span-2"
              placeholder="Mensagem"
              value={notice.message}
              onChange={(e) =>
                setNotice({ ...notice, message: e.target.value })
              }
            />
            {notice.imageUrl && (
              <img
                src={notice.imageUrl}
                alt="preview"
                className="md:col-span-2 max-h-40 w-fit rounded-md border"
              />
            )}
            <Button className="w-fit">Enviar notificação</Button>
          </form>
        </CardContent>
      </Card>
      <EditDialog
        row={edit}
        onOpenChange={() => setEdit(null)}
        onSave={(patch) =>
          call({ action: "updateUser", userId: edit?.user_id, ...patch })
        }
      />
      <MsgDialog
        state={msg}
        setState={setMsg}
        onSave={() =>
          call({
            action: "addMessages",
            userId: msg.userId,
            amount: Number(msg.amount),
          })
        }
      />
      <LimitDialog
        state={editLimit}
        setState={setEditLimit}
        onSave={() =>
          call({
            action: "setMessageLimit",
            userId: editLimit.userId,
            limit: Number(editLimit.limit),
          })
        }
      />
    </AdminShell>
  );
}
function Stat({ label, value, icon, onClick }: any) {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer border-border/60 shadow-sm"
    >
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-3 text-primary">{icon}</div>
      </CardContent>
    </Card>
  );
}
function UserDialog({ title, form, setForm, onSubmit }: any) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-3">
        <Input
          required
          placeholder="Nome completo"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          required
          type="email"
          placeholder="Email real do usuário"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          required
          placeholder="Número de telefone (com DDI)"
          value={form.phone}
          onChange={(e) =>
            setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })
          }
        />
        <Input
          required
          type="password"
          placeholder="Senha (mín. 6)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Button className="w-full">Cadastrar</Button>
      </form>
    </DialogContent>
  );
}
function UserTable({ title, rows, planNames, onEdit, onMsg, onEditLimit, onSuspend, onDelete }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3">Nome</th>
              <th>Telefone</th>
              <th>Data</th>
              <th>Mensagens</th>
              <th>Plano</th>
              <th>Província</th>
              <th>Origem</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u: Row) => (
              <tr key={u.user_id} className="border-b last:border-0">
                <td className="py-3 font-medium">
                  {u.full_name || u.business_name || "Usuário"}
                </td>
                <td>+{u.phone || ""}</td>
                <td>
                  {u.created_at
                    ? new Date(u.created_at).toLocaleDateString("pt-AO")
                    : "-"}
                </td>
                <td>
                  {Number(u.message_limit || 0) -
                    Number(u.messages_received || 0)}{" "}
                  / {u.message_limit || 0}
                </td>
                <td>{planNames[u.plan_id || ""] || "Teste"}</td>
                <td>{u.province || "-"}</td>
                <td>{u.acquisition_source || "-"}</td>
                <td>
                  {u.is_suspended || u.status === "suspended"
                    ? "Suspenso"
                    : u.account_status === "trial" && u.trial_started_at
                      ? "Em teste"
                      : u.account_status === "trial"
                        ? "Conta criada"
                      : u.account_status === "awaiting_activation"
                        ? "Aguardando ativação"
                        : isOperationalUser(u)
                          ? "Ativo"
                          : "Inativo"}
                </td>
                <td className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onEdit(u)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onMsg(u)}>
                    Mensagens
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEditLimit(u)}>
                    Limite
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onSuspend(u)}
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
function EditDialog({ row, onOpenChange, onSave }: any) {
  const [p, setP] = useState<any>({});
  useEffect(() => {
    setP({
      full_name: row?.full_name || "",
      phone: row?.phone || "",
      business_name: row?.business_name || "",
      password: "",
    });
  }, [row]);
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={p.full_name || ""}
            onChange={(e) => setP({ ...p, full_name: e.target.value })}
          />
          <Input
            value={p.phone || ""}
            onChange={(e) =>
              setP({ ...p, phone: e.target.value.replace(/\D/g, "") })
            }
          />
          <Input
            value={p.business_name || ""}
            onChange={(e) => setP({ ...p, business_name: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Nova senha opcional"
            value={p.password || ""}
            onChange={(e) => setP({ ...p, password: e.target.value })}
          />
          <Button className="w-full" onClick={() => onSave(p)}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function MsgDialog({ state, setState, onSave }: any) {
  return (
    <Dialog
      open={!!state.userId}
      onOpenChange={() => setState({ userId: "", amount: "" })}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar mensagens</DialogTitle>
        </DialogHeader>
        <Input
          type="number"
          placeholder="Quantidade"
          value={state.amount}
          onChange={(e) => setState({ ...state, amount: e.target.value })}
        />
        <Button onClick={onSave}>Adicionar</Button>
      </DialogContent>
    </Dialog>
  );
}
function LimitDialog({ state, setState, onSave }: any) {
  return (
    <Dialog
      open={!!state.userId}
      onOpenChange={() => setState({ userId: "", limit: "" })}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar limite de mensagens</DialogTitle>
        </DialogHeader>
        <Input
          type="number"
          placeholder="Limite total"
          value={state.limit}
          onChange={(e) => setState({ ...state, limit: e.target.value })}
        />
        <Button onClick={onSave}>Guardar</Button>
      </DialogContent>
    </Dialog>
  );
}
