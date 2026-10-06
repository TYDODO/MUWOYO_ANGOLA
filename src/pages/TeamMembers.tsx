import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";

const permissionOptions = [
  ["inbox.view", "Ver conversas"], ["inbox.send", "Enviar mensagens"], ["inbox.assign", "Atribuir conversas"], ["inbox.view_unassigned", "Ver não atribuídas"],
  ["contacts.view", "Ver contactos"], ["contacts.edit", "Editar contactos"], ["crm.view", "Ver CRM"], ["crm.edit", "Editar CRM"],
  ["orders.view", "Ver pedidos"], ["orders.create", "Criar pedidos"], ["orders.edit", "Editar pedidos"], ["agenda.view", "Ver agenda"], ["agenda.create", "Criar agendamentos"], ["agenda.edit", "Editar agenda"], ["products.view", "Ver produtos"], ["products.edit", "Editar produtos"],
] as const;
type Member = { id: string; name: string | null; email: string; status: string; business_member_permissions?: { permission: string; enabled: boolean }[] };

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
  const { isOwner, loading: membershipLoading } = useBusinessMembership();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"] });

  const load = async () => {
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "list" } });
    if (error) toast({ title: "Não foi possível carregar a equipa", description: "Verifique a sua ligação e tente novamente.", variant: "destructive" });
    setMembers(data?.members || []);
  };
  useEffect(() => { if (isOwner) void load(); }, [isOwner]);

  const create = async () => {
    if (editingMember) {
      if (!form.name.trim()) return toast({ title: "Informe o nome do atendente." });
      setSaving(true);
      const { data: nameData, error: nameError } = await supabase.functions.invoke("team-members", { body: { action: "update_name", member_id: editingMember.id, name: form.name.trim() } });
      if (!nameError && !nameData?.error) {
        const { data: permissionData, error: permissionError } = await supabase.functions.invoke("team-members", { body: { action: "permissions", member_id: editingMember.id, permissions: form.permissions } });
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
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "create", ...form } });
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
    setOpen(false); setForm({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"] }); void load();
  };
  const edit = (member: Member) => {
    setEditingMember(member);
    setForm({
      name: member.name || "",
      email: member.email,
      password: "",
      permissions: member.business_member_permissions?.filter((item) => item.enabled).map((item) => item.permission) || [],
    });
    setOpen(true);
  };
  const setStatus = async (memberId: string, status: string) => { const { error } = await supabase.functions.invoke("team-members", { body: { action: "status", member_id: memberId, status } }); if (error) toast({ title: "Não foi possível alterar o estado", description: "Verifique a sua ligação e tente novamente.", variant: "destructive" }); else void load(); };
  const resendConfirmation = async (member: Member) => {
    const { data, error } = await supabase.functions.invoke("team-members", { body: { action: "resend_confirmation", member_id: member.id } });
    if (error || data?.error) return toast({ title: "Não foi possível reenviar o código", description: getTeamErrorMessage(data?.error || await getFunctionErrorCode(error)), variant: "destructive" });
    toast({ title: "Código reenviado", description: `Enviámos outro código para ${member.email}.` });
  };

  if (membershipLoading) return <DashboardShell title="Atendentes"><Loader2 className="h-5 w-5 animate-spin" /></DashboardShell>;
  if (!isOwner) return null;
  return <DashboardShell title="Atendentes" description="Gerencie os membros que atendem os seus clientes.">
    <div className="flex justify-end"><Button onClick={() => { setEditingMember(null); setForm({ name: "", email: "", password: "", permissions: ["inbox.view", "inbox.send"] }); setOpen(true); }}><UserPlus className="mr-2 h-4 w-4" />Adicionar atendente</Button></div>
    <Card><CardHeader><CardTitle>Equipa</CardTitle></CardHeader><CardContent className="space-y-2">{members.filter((member) => member.status !== "removed").map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"><div><div className="font-medium">{member.name || member.email}</div><div className="text-sm text-muted-foreground">{member.email}</div><div className="mt-1 flex flex-wrap gap-1">{member.business_member_permissions?.filter((item) => item.enabled).map((item) => <Badge key={item.permission} variant="secondary">{item.permission}</Badge>)}</div></div><div className="flex flex-wrap items-center gap-2"><Badge variant={member.status === "active" ? "default" : "outline"}>{member.status === "pending" ? "A confirmar e-mail" : member.status === "active" ? "Ativo" : member.status === "suspended" ? "Suspenso" : member.status}</Badge>{member.status === "pending" && <Button size="sm" variant="outline" onClick={() => void resendConfirmation(member)}>Reenviar confirmação</Button>}<Button size="sm" variant="outline" onClick={() => edit(member)}>Editar</Button>{member.status === "active" ? <Button size="sm" variant="outline" onClick={() => void setStatus(member.id, "suspended")}>Suspender</Button> : <Button size="sm" onClick={() => void setStatus(member.id, "active")}>Ativar</Button>}</div></div>)}{members.length === 0 && <p className="text-sm text-muted-foreground">Ainda não existem atendentes.</p>}</CardContent></Card>
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setEditingMember(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingMember ? "Editar atendente" : "Adicionar atendente"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label htmlFor="member-name">Nome</Label><Input id="member-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>{!editingMember && <><div><Label htmlFor="member-email">Email</Label><Input id="member-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div><Label htmlFor="member-password">Senha inicial</Label><Input id="member-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div></>}<div className="grid gap-3 sm:grid-cols-2">{permissionOptions.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><Checkbox checked={form.permissions.includes(value)} onCheckedChange={(checked) => setForm({ ...form, permissions: checked ? [...form.permissions, value] : form.permissions.filter((permission) => permission !== value) })} />{label}</label>)}</div><Button className="w-full" disabled={saving} onClick={() => void create()}>{saving ? "A guardar..." : editingMember ? "Guardar alterações" : "Cadastrar atendente"}</Button></div></DialogContent></Dialog>
  </DashboardShell>;
}
