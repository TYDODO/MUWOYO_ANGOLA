import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/integrations/supabase/app-types";

const appDb = supabase as unknown as SupabaseClient<AppDatabase>;

const permissionOptions = [
  ["inbox.view", "Ver conversas"], ["inbox.send", "Enviar mensagens"], ["inbox.assign", "Atribuir conversas"], ["inbox.view_unassigned", "Ver conversas sem responsável"], ["inbox.manage", "Gerir conversas"],
  ["contacts.view", "Ver contactos"], ["contacts.edit", "Editar contactos"], ["contacts.delete", "Eliminar contactos"],
  ["crm.view", "Ver CRM"], ["crm.edit", "Editar CRM"], ["crm.manage", "Gerir etapas e etiquetas"],
  ["campaigns.view", "Ver campanhas"], ["campaigns.manage", "Gerir e enviar campanhas"],
  ["orders.view", "Ver pedidos"], ["orders.create", "Criar pedidos"], ["orders.edit", "Editar pedidos"], ["orders.delete", "Eliminar pedidos"],
  ["agenda.view", "Ver agendamentos"], ["agenda.create", "Criar agendamentos"], ["agenda.edit", "Editar agendamentos"], ["agenda.delete", "Eliminar agendamentos"],
  ["products.view", "Ver produtos"], ["products.create", "Criar produtos"], ["products.edit", "Editar produtos"], ["products.delete", "Eliminar produtos"],
] as const;
type PermissionScope = "all" | "own";
type Member = { id: string; name: string | null; email: string; status: string; business_member_permissions?: { permission: string; enabled: boolean; data_scope?: PermissionScope }[] };
type Presence = { user_id: string; is_online: boolean; last_seen_at: string };
type AuditEntry = { id: string; action: string; target_user_id: string | null; conversation_id: string | null; created_at: string };
type Performance = { assigned_messages: number; answered_messages: number; unanswered_messages: number };
const defaultPermissionScopes = Object.fromEntries(permissionOptions.map(([permission]) => [permission, "all"])) as Record<string, PermissionScope>;

function getTeamErrorMessage(code?: string | null) {
  if (code === "attendant_limit_reached") return "Você atingiu o limite de atendentes do seu plano. Faça upgrade para adicionar outro.";
  if (code === "invalid_input") return "Confira o nome, o e-mail e se a senha tem pelo menos 8 caracteres.";
  if (code === "owner_required") return "Apenas o responsável pela conta pode gerir atendentes.";
  if (code === "resend_cooldown") return "Aguarde um minuto antes de pedir outro código de confirmação.";
  if (code?.toLowerCase().includes("already registered") || code?.toLowerCase().includes("already been registered")) return "Já existe uma conta com este e-mail. Use outro e-mail ou peça ao responsável para associar a conta existente.";
  return "Não foi possível concluir. Verifique os dados e tente novamente.";
}

async function getFunctionErrorCode(error: { message: string; context?: unknown } | null) {
  if (!error) return null;
  if (error.context instanceof Response) {
    const body = await error.context.clone().json().catch(() => null);
    return String(body?.error || body?.message || error.message);
  }
  return error.message;
}

export default function TeamMembers() {
  const { isOwner, loading: membershipLoading, membership } = useBusinessMembership();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [performance, setPerformance] = useState<Record<string, Performance>>({});
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"], permissionScopes: defaultPermissionScopes });

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "list" } });
    if (error) toast({ title: "Não foi possível carregar a equipa", description: "Verifique a sua ligação e tente novamente.", variant: "destructive" });
    setMembers(data?.members || []);
    if (!membership?.business_id) return;
    const [presenceResult, auditResult, performanceResult] = await Promise.all([
      appDb.from("business_member_presence").select("user_id,is_online,last_seen_at").eq("business_id", membership.business_id),
      appDb.from("business_audit_log").select("id,action,target_user_id,conversation_id,created_at").eq("business_id", membership.business_id).in("action", ["inbox_auto_assigned", "inbox_conversation_assigned", "inbox_conversation_unassigned", "inbox_message_assigned", "inbox_message_sent"]).order("created_at", { ascending: false }).limit(100),
      appDb.rpc("get_attendant_message_stats", { p_business_id: membership.business_id }),
    ]);
    if (presenceResult.error) toast({ title: "Não foi possível carregar presença dos atendentes", description: presenceResult.error.message, variant: "destructive" });
    else setPresence(presenceResult.data || []);
    if (auditResult.error) toast({ title: "Não foi possível carregar a auditoria da equipa", description: auditResult.error.message, variant: "destructive" });
    else setAuditEntries(auditResult.data || []);
    if (performanceResult.error) toast({ title: "Não foi possível carregar as métricas da equipa", description: performanceResult.error.message, variant: "destructive" });
    else setPerformance(Object.fromEntries((performanceResult.data || []).map((row) => [row.attendant_user_id, {
      assigned_messages: Number(row.assigned_messages),
      answered_messages: Number(row.answered_messages),
      unanswered_messages: Number(row.unanswered_messages),
    }])));
  }, [membership?.business_id, toast]);
  useEffect(() => {
    if (!isOwner) return;
    void load();
    const refresh = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(refresh);
  }, [isOwner, load]);

  const create = async () => {
    if (editingMember) {
      if (!form.name.trim()) return toast({ title: "Informe o nome do atendente." });
      setSaving(true);
      const { data: nameData, error: nameError } = await supabase.functions.invoke("team-members", { body: { action: "update_name", member_id: editingMember.id, name: form.name.trim() } });
      if (!nameError && !nameData?.error) {
        const { data: permissionData, error: permissionError } = await supabase.functions.invoke("team-members", { body: { action: "permissions", member_id: editingMember.id, permissions: form.permissions, permission_scopes: form.permissionScopes } });
        setSaving(false);
        if (permissionError || permissionData?.error) return toast({ title: "Nome atualizado, mas não foi possível guardar permissões", description: permissionData?.error || permissionError?.message, variant: "destructive" });
        toast({ title: "Atendente atualizado" });
        setOpen(false);
        setEditingMember(null);
        void load();
        return;
      }
      setSaving(false);
      return toast({ title: "Não foi possível atualizar atendente", description: getTeamErrorMessage(nameData?.error || await getFunctionErrorCode(nameError)), variant: "destructive" });
    }
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) return toast({ title: "Preencha nome, email e uma senha com 8 caracteres." });
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "create", ...form, permission_scopes: form.permissionScopes } });
    setSaving(false);
    if (error || data?.error) {
      const limitReached = data?.error === "attendant_limit_reached";
      return toast({
        title: limitReached ? "Limite de atendentes atingido" : "Não foi possível criar atendente",
        description: getTeamErrorMessage(data?.error || await getFunctionErrorCode(error)),
        variant: "destructive",
      });
    }
    toast({ title: "Atendente criado", description: data?.verification_sent ? "Enviámos um código para confirmar o e-mail. O atendente será encaminhado para essa confirmação antes de entrar." : "A conta foi criada, mas não foi possível enviar o código. Use Reenviar confirmação na lista." });
    setOpen(false); setForm({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"], permissionScopes: defaultPermissionScopes }); void load();
  };
  const edit = (member: Member) => {
    setEditingMember(member);
    setForm({
      name: member.name || "",
      email: member.email,
      password: "",
      permissions: member.business_member_permissions?.filter((item) => item.enabled).map((item) => item.permission) || [],
      permissionScopes: { ...defaultPermissionScopes, ...Object.fromEntries(member.business_member_permissions?.map((item) => [item.permission, item.data_scope || "all"]) || []) },
    });
    setOpen(true);
  };
  const setStatus = async (memberId: string, status: string) => { const { error } = await supabase.functions.invoke("team-members", { body: { action: "status", member_id: memberId, status } }); if (error) toast({ title: "Não foi possível alterar o estado", description: "Verifique a sua ligação e tente novamente.", variant: "destructive" }); else void load(); };
  const resendConfirmation = async (member: Member) => {
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "resend_confirmation", member_id: member.id } });
    if (error || data?.error) return toast({ title: "Não foi possível reenviar o código", description: getTeamErrorMessage(data?.error || await getFunctionErrorCode(error)), variant: "destructive" });
    toast({ title: "Código reenviado", description: `Enviámos outro código para ${member.email}.` });
  };
  const isOnline = (memberId: string) => {
    const record = presence.find((item) => item.user_id === memberId);
    return Boolean(record?.is_online && Date.now() - new Date(record.last_seen_at).getTime() < 45_000);
  };
  const activityLabel = (action: string) => ({
    inbox_auto_assigned: "Conversa atribuída automaticamente",
    inbox_conversation_assigned: "Conversa atribuída manualmente",
    inbox_conversation_unassigned: "Conversa retirada do atendente",
    inbox_message_assigned: "Nova mensagem atribuída",
    inbox_message_sent: "Mensagem respondida pelo atendente",
  }[action] || action);

  if (membershipLoading) return <DashboardShell title="Atendentes"><Loader2 className="h-5 w-5 animate-spin" /></DashboardShell>;
  if (!isOwner) return null;
  return <DashboardShell title="Atendentes" description="Gerencie os membros que atendem os seus clientes.">
    <Tabs defaultValue="team" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList><TabsTrigger value="team">Equipa</TabsTrigger><TabsTrigger value="audit">Auditoria</TabsTrigger></TabsList>
        <Button onClick={() => { setEditingMember(null); setForm({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"], permissionScopes: defaultPermissionScopes }); setOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Adicionar atendente</Button>
      </div>
      <TabsContent value="team">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Atendentes</CardTitle></CardHeader><CardContent className="space-y-2">{members.filter((member) => member.status !== "removed").map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div className="min-w-0"><button type="button" className="truncate text-left font-medium hover:text-primary" onClick={() => setSelectedMember(member)}>{member.name || member.email}</button><div className="text-sm text-muted-foreground">{member.email}</div><div className="mt-1 flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${isOnline(member.id) ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />{isOnline(member.id) ? "Online agora" : "Offline"}</div></div><div className="flex flex-wrap items-center gap-2"><Badge variant={member.status === "active" ? "default" : "outline"}>{member.status === "pending" ? "A confirmar e-mail" : member.status === "active" ? "Ativo" : member.status === "suspended" ? "Suspenso" : member.status}</Badge>{member.status === "pending" && <Button size="sm" variant="outline" onClick={() => void resendConfirmation(member)}>Reenviar confirmação</Button>}<Button size="sm" variant="outline" onClick={() => edit(member)}>Editar</Button>{member.status === "active" ? <Button size="sm" variant="outline" onClick={() => void setStatus(member.id, "suspended")}>Suspender</Button> : <Button size="sm" onClick={() => void setStatus(member.id, "active")}>Ativar</Button>}</div></div>)}{members.length === 0 && <p className="text-sm text-muted-foreground">Ainda não existem atendentes.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>{selectedMember ? selectedMember.name || selectedMember.email : "Dados do atendente"}</CardTitle></CardHeader><CardContent>{selectedMember ? <div className="space-y-4"><div className="space-y-1 text-sm"><p>{selectedMember.email}</p><p>Estado: {selectedMember.status === "active" ? "Ativo" : selectedMember.status === "pending" ? "A confirmar e-mail" : selectedMember.status}</p><p>Presença: {isOnline(selectedMember.id) ? "Online agora" : "Offline"}</p></div><div><h3 className="mb-2 text-sm font-semibold">Permissões ativas</h3><div className="flex flex-wrap gap-1">{selectedMember.business_member_permissions?.filter((item) => item.enabled).map((item) => <Badge key={item.permission} variant="secondary">{permissionOptions.find(([value]) => value === item.permission)?.[1] || item.permission} · {item.data_scope === "own" ? "Apenas atribuídos" : "Todos os dados"}</Badge>)}</div>{!selectedMember.business_member_permissions?.some((item) => item.enabled) && <p className="text-sm text-muted-foreground">Sem permissões ativas.</p>}</div><Button size="sm" variant="outline" onClick={() => edit(selectedMember)}>Editar permissões</Button></div> : <p className="text-sm text-muted-foreground">Selecione um atendente para consultar os dados e as permissões.</p>}</CardContent></Card>
        </div>
      </TabsContent>
      <TabsContent value="audit">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Auditoria de atendimento</CardTitle></CardHeader><CardContent className="space-y-3">{members.filter((member) => member.status !== "removed").map((member) => { const stats = performance[member.id] || { assigned_messages: 0, answered_messages: 0, unanswered_messages: 0 }; return <div key={member.id} className="grid gap-2 rounded-md border p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-center"><div className="font-medium">{member.name || member.email}<div className="mt-1 flex items-center gap-2 text-xs font-normal text-muted-foreground"><span className={`h-2 w-2 rounded-full ${isOnline(member.id) ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />{isOnline(member.id) ? "Online" : "Offline"}</div></div><div className="text-sm"><span className="text-muted-foreground">Mensagens atribuídas:</span> {stats.assigned_messages}</div><div className="text-sm"><span className="text-muted-foreground">Respondidas:</span> {stats.answered_messages}</div><div className="text-sm"><span className="text-muted-foreground">Por responder:</span> {stats.unanswered_messages}</div><Badge variant={member.status === "active" ? "default" : "outline"}>{member.status === "active" ? "Ativo" : member.status}</Badge></div>; })}{!members.length && <p className="text-sm text-muted-foreground">Ainda não existem atividades para apresentar.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Atividade recente</CardTitle></CardHeader><CardContent className="space-y-2">{auditEntries.map((entry) => { const member = members.find((item) => item.id === entry.target_user_id); return <div key={entry.id} className="flex flex-col gap-1 border-b pb-2 text-sm last:border-0 sm:flex-row sm:items-center sm:justify-between"><span>{member?.name || member?.email || "Equipa"} · {activityLabel(entry.action)}</span><time className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("pt-AO")}</time></div>; })}{!auditEntries.length && <p className="text-sm text-muted-foreground">Ainda não há atividade registada.</p>}</CardContent></Card>
        </div>
      </TabsContent>
    </Tabs>
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setEditingMember(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingMember ? "Editar atendente" : "Adicionar atendente"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label htmlFor="member-name">Nome</Label><Input id="member-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>{!editingMember && <><div><Label htmlFor="member-email">Email</Label><Input id="member-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div><Label htmlFor="member-password">Senha inicial</Label><Input id="member-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div></>}<div className="space-y-2">{permissionOptions.map(([value, label]) => <div key={value} className="flex flex-wrap items-center justify-between gap-3 border-b pb-2"><label className="flex items-center gap-2 text-sm"><Checkbox checked={form.permissions.includes(value)} onCheckedChange={(checked) => setForm({ ...form, permissions: checked ? [...form.permissions, value] : form.permissions.filter((permission) => permission !== value) })} />{label}</label>{form.permissions.includes(value) && <Select value={form.permissionScopes[value] || "all"} onValueChange={(scope: PermissionScope) => setForm({ ...form, permissionScopes: { ...form.permissionScopes, [value]: scope } })}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os dados</SelectItem><SelectItem value="own">Apenas atribuídos</SelectItem></SelectContent></Select>}</div>)}</div><Button className="w-full" disabled={saving} onClick={() => void create()}>{saving ? "A guardar..." : editingMember ? "Guardar alterações" : "Cadastrar atendente"}</Button></div></DialogContent></Dialog>
  </DashboardShell>;
}
