import { FormEvent, useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
type Rule = { id: string; name: string; delay_minutes: number; max_attempts: number; ai_instruction: string | null; is_active: boolean; created_at: string };
type Job = { id: string; status: string; attempts: number; due_at: string; contact_id: string; contact?: { name: string | null; phone_number: string } };
type Contact = { id: string; name: string | null; phone_number: string };
type Stage = { delay_minutes: string; instruction: string; message_template: string; use_ai: boolean };

export default function FollowUp() {
  const { user } = useAuth();
  const { entitlements, planName, loading } = usePlanEntitlements();
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [stages, setStages] = useState<Stage[]>([{ delay_minutes: "120", instruction: "", message_template: "", use_ai: true }]);
  const [form, setForm] = useState({ name: "", delay_minutes: "120", max_attempts: "3", ai_instruction: "" });
  const [activeInstance, setActiveInstance] = useState<{ id: string; instance_name: string } | null>(null);
  const activeRules = rules.filter((rule) => rule.is_active).length;
  const pendingJobs = jobs.filter((job) => job.status === "pending").length;
  const sentJobs = jobs.filter((job) => job.status === "sent").length;

  const load = async () => {
    if (!user) return;
    const { data: instance } = await db.from("instances").select("id,instance_name").eq("user_id", user.id).eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setActiveInstance(instance || null);
    if (!instance) { setRules([]); setJobs([]); setContacts([]); return; }
    const [{ data: ruleRows }, { data: jobRows }, { data: contacts }] = await Promise.all([
      db.from("follow_up_rules").select("id,name,delay_minutes,max_attempts,ai_instruction,is_active,created_at").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).order("created_at", { ascending: false }),
      db.from("follow_up_jobs").select("id,status,attempts,due_at,contact_id").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).order("due_at").limit(100),
      db.from("whatsapp_contacts").select("id,name,phone_number,is_group").eq("user_id", user.id).eq("whatsapp_instance_id", instance.id).eq("is_group", false),
    ]);
    const contactMap = new Map((contacts || []).map((contact: { id: string; name: string | null; phone_number: string }) => [contact.id, contact]));
    setRules(ruleRows || []);
    setJobs((jobRows || []).map((job: Job) => ({ ...job, contact: contactMap.get(job.contact_id) })));
    setContacts(contacts || []);
  };
  useEffect(() => { void load(); }, [user]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !activeInstance) return;
    const { data: rule, error } = await db.from("follow_up_rules").insert({ user_id: user.id, whatsapp_instance_id: activeInstance.id, name: form.name.trim(), delay_minutes: Number(form.delay_minutes), max_attempts: Number(form.max_attempts), ai_instruction: form.ai_instruction.trim() || null, is_active: false }).select("id").single();
    if (error || !rule) return toast({ title: "Não foi possível criar a regra", description: error?.message, variant: "destructive" });
    const stageRows = stages.map((stage, position) => ({ rule_id: rule.id, position, delay_minutes: Number(stage.delay_minutes) || 120, instruction: stage.instruction.trim() || null, message_template: stage.message_template.trim() || null, use_ai: stage.use_ai }));
    const stageResult = await db.from("follow_up_stages").insert(stageRows);
    const contactResult = selectedContacts.length ? await db.from("follow_up_rule_contacts").insert(selectedContacts.map((contact_id) => ({ rule_id: rule.id, contact_id, user_id: user.id }))) : { error: null };
    if (stageResult.error || contactResult.error) return toast({ title: "Regra criada, mas não foi possível guardar todas as etapas/contactos", description: stageResult.error?.message || contactResult.error?.message, variant: "destructive" });
    setForm({ name: "", delay_minutes: "120", max_attempts: "3", ai_instruction: "" });
    setStages([{ delay_minutes: "120", instruction: "", message_template: "", use_ai: true }]);
    setSelectedContacts([]);
    toast({ title: "Regra criada" });
    void load();
  };

  const toggleRule = async (rule: Rule) => {
    const { error } = await db.from("follow_up_rules").update({ is_active: !rule.is_active }).eq("id", rule.id).eq("user_id", user?.id);
    if (error) return toast({ title: "Não foi possível atualizar a regra", description: error.message, variant: "destructive" });
    void load();
  };

  if (loading) return <DashboardShell title="Follow Up IA" description="A carregar acesso...">A carregar...</DashboardShell>;
  if (!entitlements.followUp) return <DashboardShell title="Follow Up IA" description="Recupere oportunidades de conversas existentes."><Card><CardContent className="space-y-3 p-6"><CardTitle>Follow Up IA</CardTitle><p className="text-sm text-muted-foreground">Disponível a partir do plano Growth. Plano atual: {planName}.</p><Button onClick={() => window.location.assign("/recargas")}>Fazer upgrade</Button></CardContent></Card></DashboardShell>;

  return <DashboardShell title="Follow Up IA" description="Configure regras para conversas existentes que ficaram sem conclusão.">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Follow Up IA</h2><p className="text-sm text-muted-foreground">Transforme conversas paradas em novas oportunidades.</p></div><Button onClick={() => document.getElementById("new-follow-up")?.scrollIntoView({ behavior: "smooth" })}>+ Criar Follow Up</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Agentes", activeRules, "ativos"], ["Em Follow Up", pendingJobs, "contactos"], ["Recuperados", sentJobs, "follow ups enviados"], ["Taxa de resposta", sentJobs ? `${Math.round((sentJobs / Math.max(jobs.length, 1)) * 100)}%` : "0%", "base atual"]].map(([label, value, caption]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{caption}</p></CardContent></Card>)}</div>
    <Card id="new-follow-up"><CardHeader><CardTitle>Nova regra</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-3"><div className="grid gap-3 md:grid-cols-2"><Input required placeholder="Nome da regra" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input required type="number" min="1" placeholder="Esperar minutos (padrão)" value={form.delay_minutes} onChange={(e) => setForm({ ...form, delay_minutes: e.target.value })} /><Input required type="number" min="1" max="20" placeholder="Máximo de tentativas" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: e.target.value })} /><Textarea placeholder="Regras gerais para a IA" value={form.ai_instruction} onChange={(e) => setForm({ ...form, ai_instruction: e.target.value })} /></div><div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Etapas</h3><Button type="button" size="sm" variant="outline" onClick={() => setStages([...stages, { delay_minutes: "1440", instruction: "", message_template: "", use_ai: true }])}>Adicionar etapa</Button></div>{stages.map((stage, index) => <div key={index} className="grid gap-2 rounded border p-3 md:grid-cols-[140px_1fr_1fr_auto]"><Input type="number" min="1" value={stage.delay_minutes} onChange={(e) => setStages(stages.map((item, i) => i === index ? { ...item, delay_minutes: e.target.value } : item))} /><Input placeholder={`Instrução da etapa ${index + 1}`} value={stage.instruction} onChange={(e) => setStages(stages.map((item, i) => i === index ? { ...item, instruction: e.target.value } : item))} /><Input placeholder="Mensagem padrão opcional" value={stage.message_template} onChange={(e) => setStages(stages.map((item, i) => i === index ? { ...item, message_template: e.target.value } : item))} /><label className="flex items-center gap-2 text-xs"><Checkbox checked={stage.use_ai} onCheckedChange={(checked) => setStages(stages.map((item, i) => i === index ? { ...item, use_ai: Boolean(checked) } : item))} />IA</label></div>)}</div><div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Contactos</h3><Button type="button" size="sm" variant="outline" onClick={() => setSelectedContacts(selectedContacts.length === contacts.length ? [] : contacts.map((contact) => contact.id))}>{selectedContacts.length === contacts.length ? "Limpar todos" : "Selecionar todos"}</Button></div><div className="max-h-48 overflow-y-auto rounded border p-2">{contacts.map((contact) => <label key={contact.id} className="flex items-center gap-2 border-b py-2 text-sm last:border-0"><Checkbox checked={selectedContacts.includes(contact.id)} onCheckedChange={(checked) => setSelectedContacts(checked ? [...selectedContacts, contact.id] : selectedContacts.filter((id) => id !== contact.id))} /><span>{contact.name || contact.phone_number}</span></label>)}</div><p className="text-xs text-muted-foreground">{selectedContacts.length} contactos selecionados</p></div><Button className="w-fit">Guardar regra</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Regras configuradas</CardTitle></CardHeader><CardContent className="space-y-2">{rules.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra criada.</p>}{rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{rule.name}</div><div className="text-sm text-muted-foreground">Após {rule.delay_minutes} min · até {rule.max_attempts} tentativa(s)</div></div><div className="flex items-center gap-2"><Badge variant={rule.is_active ? "default" : "outline"}>{rule.is_active ? "Ativa" : "Inativa"}</Badge><Button size="sm" variant="outline" onClick={() => void toggleRule(rule)}>{rule.is_active ? "Desativar" : "Ativar"}</Button></div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Follow Ups em acompanhamento</CardTitle></CardHeader><CardContent className="space-y-2">{jobs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum Follow Up pendente ou histórico disponível.</p>}{jobs.map((job) => <div key={job.id} className="flex items-center justify-between rounded border p-3 text-sm"><div><div className="font-medium">{job.contact?.name || job.contact?.phone_number || "Contacto"}</div><div className="text-muted-foreground">Tentativas: {job.attempts} · previsto para {new Date(job.due_at).toLocaleString("pt-AO")}</div></div><Badge variant={job.status === "pending" ? "default" : "outline"}>{job.status}</Badge></div>)}</CardContent></Card>
  </DashboardShell>;
}
