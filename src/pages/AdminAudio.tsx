import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Save, Trash2, X } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Plan = { id: string; name: string };
type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  plan_id: string | null;
  account_status: string;
  subscription_expires_at: string | null;
  plan_audio_seconds_total: number;
  plan_audio_seconds_used: number;
  topup_audio_seconds_balance: number;
  audio_enabled: boolean;
};
type Voice = { id: string; user_id: string; model_id: string; title: string; is_active: boolean };
type CuratedVoice = { id: string; fish_reference_id: string; display_name: string; description: string; gender: string | null; language: string | null; sample_audio_url: string | null; is_active: boolean; sort_order: number };
type CuratedDraft = { display_name: string; description: string; sort_order: string };
type Topup = { id: string; user_id: string; minutes: number; amount_kz: number; payment_id: string; proof_path: string; submitted_at: string; status: string };
type Draft = { planMinutes: string; usedMinutes: string; topupMinutes: string; enabled: boolean };

function toDraft(profile: Profile): Draft {
  return {
    planMinutes: String(Number(profile.plan_audio_seconds_total || 0) / 60),
    usedMinutes: String(Number(profile.plan_audio_seconds_used || 0) / 60),
    topupMinutes: String(Number(profile.topup_audio_seconds_balance || 0) / 60),
    enabled: profile.audio_enabled,
  };
}
const minutesLabel = (seconds: number) => `${(seconds / 60).toLocaleString("pt-AO", { maximumFractionDigits: 2 })} min`;

export default function AdminAudio() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [curatedVoices, setCuratedVoices] = useState<CuratedVoice[]>([]);
  const [curatedDrafts, setCuratedDrafts] = useState<Record<string, CuratedDraft>>({});
  const [newVoiceReference, setNewVoiceReference] = useState("");
  const [requests, setRequests] = useState<Topup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [profileResult, planResult, voiceResult, requestResult, curatedResult] = await Promise.all([
      supabase.from("profiles").select("user_id,full_name,email,plan_id,account_status,subscription_expires_at,plan_audio_seconds_total,plan_audio_seconds_used,topup_audio_seconds_balance,audio_enabled").order("created_at", { ascending: false }),
      supabase.from("subscription_plans").select("id,name"),
      supabase.from("audio_voice_models").select("id,user_id,model_id,title,is_active").order("created_at", { ascending: false }),
      supabase.from("audio_topup_requests").select("id,user_id,minutes,amount_kz,payment_id,proof_path,submitted_at,status").eq("status", "pending").order("submitted_at", { ascending: true }),
      supabase.functions.invoke("list-fish-voices", { body: { action: "curated_admin_list" } }),
    ]);
    const error = profileResult.error || planResult.error || voiceResult.error || requestResult.error || curatedResult.error;
    if (error) {
      toast({ title: "Erro ao carregar gestão de áudio", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const profileRows = (profileResult.data || []) as Profile[];
    setProfiles(profileRows);
    setPlans(planResult.data || []);
    setVoices(voiceResult.data || []);
    setRequests(requestResult.data || []);
    const curatedRows = Array.isArray(curatedResult.data?.items) ? curatedResult.data.items as CuratedVoice[] : [];
    setCuratedVoices(curatedRows);
    setCuratedDrafts(Object.fromEntries(curatedRows.map((voice) => [voice.id, {
      display_name: voice.display_name,
      description: voice.description,
      sort_order: String(voice.sort_order),
    }])));
    setDrafts(Object.fromEntries(profileRows.map((profile) => [profile.user_id, toDraft(profile)])));
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  const planNames = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans]);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.user_id, profile])), [profiles]);
  const filteredProfiles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    return profiles.filter((profile) => `${profile.full_name || ""} ${profile.email || ""} ${planNames.get(profile.plan_id || "") || ""}`.toLocaleLowerCase("pt").includes(term));
  }, [profiles, planNames, query]);

  const saveBalance = async (profile: Profile) => {
    const draft = drafts[profile.user_id];
    if (!draft) return;
    const planMinutes = Number(draft.planMinutes);
    const usedMinutes = Number(draft.usedMinutes);
    const topupMinutes = Number(draft.topupMinutes);
    if ([planMinutes, usedMinutes, topupMinutes].some((value) => !Number.isFinite(value) || value < 0) || usedMinutes > planMinutes) {
      toast({ title: "Saldos inválidos", description: "Os valores devem ser positivos e o consumo não pode exceder o limite mensal.", variant: "destructive" });
      return;
    }
    setBusy(profile.user_id);
    const { error } = await supabase.rpc("admin_update_audio_account", {
      p_user_id: profile.user_id,
      p_plan_seconds_total: Math.round(planMinutes * 60 * 100) / 100,
      p_plan_seconds_used: Math.round(usedMinutes * 60 * 100) / 100,
      p_topup_seconds_balance: Math.round(topupMinutes * 60 * 100) / 100,
      p_audio_enabled: draft.enabled,
    });
    setBusy("");
    if (error) {
      toast({ title: "Não foi possível guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saldo de áudio atualizado" });
    await load();
  };

  const reviewTopup = async (request: Topup, approve: boolean) => {
    if (!approve && !reasons[request.id]?.trim()) {
      toast({ title: "Indique o motivo da recusa", variant: "destructive" });
      return;
    }
    setBusy(request.id);
    const { data, error } = await supabase.rpc("review_audio_topup_request", {
      p_request_id: request.id,
      p_approve: approve,
      p_reason: reasons[request.id]?.trim() || null,
    });
    setBusy("");
    if (error || (data && typeof data === "object" && "error" in data)) {
      toast({ title: "Não foi possível rever o pedido", description: error?.message || "A operação foi recusada.", variant: "destructive" });
      return;
    }
    toast({ title: approve ? "Top-up aprovado" : "Pedido recusado", description: approve ? `${Number(request.minutes).toLocaleString("pt-AO")} minutos creditados.` : "O pedido foi recusado." });
    await load();
  };

  const openProof = async (request: Topup) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(request.proof_path, 3600);
    if (error) {
      toast({ title: "Não foi possível abrir o comprovativo", description: error.message, variant: "destructive" });
      return;
    }
    setProofUrls((current) => ({ ...current, [request.id]: data.signedUrl }));
  };

  const deleteVoice = async (voice: Voice) => {
    if (!window.confirm(`Excluir "${voice.title}" da base de dados e do serviço de voz?`)) return;
    setBusy(voice.id);
    const form = new FormData();
    form.set("action", "delete");
    form.set("user_id", voice.user_id);
    form.set("model_id", voice.model_id);
    const { data, error } = await supabase.functions.invoke("clone-voice", { body: form });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível excluir a voz", description: data?.error || error?.message || "O serviço de voz não concluiu a operação.", variant: "destructive" });
      return;
    }
    toast({ title: "Voz excluída" });
    await load();
  };

  const addCuratedVoice = async () => {
    const referenceId = newVoiceReference.trim();
    if (!referenceId) return;
    setBusy("curated-add");
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "curated_add", reference_id: referenceId },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível adicionar a voz", description: data?.error || error?.message || "Confirme o identificador e tente novamente.", variant: "destructive" });
      return;
    }
    setNewVoiceReference("");
    toast({ title: "Voz adicionada às recomendações" });
    await load();
  };

  const updateCuratedVoice = async (voice: CuratedVoice, changes: Record<string, unknown>, busyId = voice.id) => {
    setBusy(busyId);
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "curated_update", id: voice.id, ...changes },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível atualizar a curadoria", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    toast({ title: "Curadoria atualizada" });
    await load();
  };

  const deleteCuratedVoice = async (voice: CuratedVoice) => {
    if (!window.confirm(`Remover "${voice.display_name}" das vozes recomendadas?`)) return;
    setBusy(voice.id);
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "curated_delete", id: voice.id },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível remover a voz", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    toast({ title: "Voz removida das recomendações" });
    await load();
  };

  return (
    <AdminShell mode="admin" title="Gestão de Áudio & Vozes" description="Saldos mensais, top-ups, comprovativos e vozes clonadas." search={query} onSearch={setQuery} onRefresh={() => void load()}>
      <Card>
        <CardHeader><CardTitle>Vozes recomendadas Muwoyo ({curatedVoices.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Adicione um identificador público. Os dados e a prévia são carregados automaticamente e podem ser ajustados para a lista de recomendações.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newVoiceReference} onChange={(event) => setNewVoiceReference(event.target.value)} placeholder="ID público da voz" aria-label="ID público da voz" />
            <Button type="button" className="shrink-0" onClick={() => void addCuratedVoice()} disabled={!newVoiceReference.trim() || Boolean(busy)}>{busy === "curated-add" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Adicionar por ID</Button>
          </div>
          {curatedVoices.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Ainda não há vozes recomendadas.</p> : curatedVoices.map((voice) => {
            const draft = curatedDrafts[voice.id] || { display_name: voice.display_name, description: voice.description, sort_order: String(voice.sort_order) };
            return <div key={voice.id} className="space-y-3 rounded-md border p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0"><p className="break-all font-medium">{voice.fish_reference_id}</p><p className="text-xs text-muted-foreground">{voice.language || "Idioma não indicado"}{voice.gender ? ` · ${voice.gender}` : ""}</p></div>
                <div className="flex items-center gap-2"><Switch checked={voice.is_active} onCheckedChange={(is_active) => void updateCuratedVoice(voice, { is_active })} aria-label={`Ativar recomendação ${voice.display_name}`} /><span className="text-sm">{voice.is_active ? "Ativa" : "Inativa"}</span></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <div className="space-y-1"><Label htmlFor={`curated-name-${voice.id}`}>Nome amigável</Label><Input id={`curated-name-${voice.id}`} maxLength={120} value={draft.display_name} onChange={(event) => setCuratedDrafts((current) => ({ ...current, [voice.id]: { ...draft, display_name: event.target.value } }))} /></div>
                <div className="space-y-1"><Label htmlFor={`curated-order-${voice.id}`}>Ordem</Label><Input id={`curated-order-${voice.id}`} type="number" step="1" value={draft.sort_order} onChange={(event) => setCuratedDrafts((current) => ({ ...current, [voice.id]: { ...draft, sort_order: event.target.value } }))} /></div>
              </div>
              <div className="space-y-1"><Label htmlFor={`curated-description-${voice.id}`}>Descrição</Label><Textarea id={`curated-description-${voice.id}`} maxLength={2000} value={draft.description} onChange={(event) => setCuratedDrafts((current) => ({ ...current, [voice.id]: { ...draft, description: event.target.value } }))} /></div>
              {voice.sample_audio_url && <audio controls src={voice.sample_audio_url} className="w-full" />}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void updateCuratedVoice(voice, { display_name: draft.display_name, description: draft.description, sort_order: Number(draft.sort_order) })} disabled={Boolean(busy) || !draft.display_name.trim() || !Number.isInteger(Number(draft.sort_order))}>{busy === voice.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => void deleteCuratedVoice(voice)} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Remover</Button>
              </div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Comprovativos pendentes de Top-up ({requests.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? <p className="text-sm text-muted-foreground">Não há Top-ups pendentes.</p> : requests.map((request) => {
            const profile = profileMap.get(request.user_id);
            return <div key={request.id} className="space-y-3 rounded-md border p-4">
              <div><p className="font-semibold">{profile?.full_name || profile?.email || request.user_id}</p><p className="text-sm text-muted-foreground">{Number(request.minutes).toLocaleString("pt-AO")} min · {Number(request.amount_kz).toLocaleString("pt-AO")} Kz · {request.payment_id}</p></div>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void openProof(request)}>Ver comprovativo</Button><Button type="button" onClick={() => void reviewTopup(request, true)} disabled={busy === request.id}>{busy === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Aprovar e creditar</Button></div>
              {proofUrls[request.id] && <a className="inline-flex items-center gap-1 text-sm text-primary underline" href={proofUrls[request.id]} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Abrir comprovativo</a>}
              <div className="flex flex-col gap-2 sm:flex-row"><Textarea aria-label="Motivo da recusa" placeholder="Motivo obrigatório para recusar..." value={reasons[request.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} /><Button type="button" variant="destructive" onClick={() => void reviewTopup(request, false)} disabled={busy === request.id || !reasons[request.id]?.trim()}><X className="mr-2 h-4 w-4" />Recusar</Button></div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Empresas e saldos ({filteredProfiles.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-5 text-sm text-muted-foreground">A carregar utilizadores...</p> : filteredProfiles.length === 0 ? <p className="py-5 text-sm text-muted-foreground">Nenhum utilizador encontrado.</p> : filteredProfiles.map((profile) => {
            const draft = drafts[profile.user_id] || toDraft(profile);
            const userVoices = voices.filter((voice) => voice.user_id === profile.user_id);
            return <div key={profile.user_id} className="space-y-4 rounded-md border p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div><p className="font-semibold">{profile.full_name || profile.email || profile.user_id}</p><p className="text-sm text-muted-foreground">{profile.email || profile.user_id} · {planNames.get(profile.plan_id || "") || "Sem plano"} · {profile.account_status}{profile.subscription_expires_at ? ` · expira ${new Date(profile.subscription_expires_at).toLocaleDateString("pt-AO")}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Plano restante: {minutesLabel(Math.max(0, profile.plan_audio_seconds_total - profile.plan_audio_seconds_used))} · Top-up: {minutesLabel(profile.topup_audio_seconds_balance)} · {userVoices.length} voz(es)</p></div>
                <div className="flex items-center gap-2"><Switch checked={draft.enabled} onCheckedChange={(enabled) => setDrafts((current) => ({ ...current, [profile.user_id]: { ...draft, enabled } }))} aria-label={`Ativar áudio para ${profile.email || profile.user_id}`} /><span className="text-sm">{draft.enabled ? "Áudio ativo" : "Áudio bloqueado"}</span></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label htmlFor={`plan-min-${profile.user_id}`}>Limite do plano (min)</Label><Input id={`plan-min-${profile.user_id}`} type="number" min="0" step="0.01" value={draft.planMinutes} onChange={(event) => setDrafts((current) => ({ ...current, [profile.user_id]: { ...draft, planMinutes: event.target.value } }))} /></div>
                <div className="space-y-1"><Label htmlFor={`used-min-${profile.user_id}`}>Consumo do plano (min)</Label><Input id={`used-min-${profile.user_id}`} type="number" min="0" step="0.01" value={draft.usedMinutes} onChange={(event) => setDrafts((current) => ({ ...current, [profile.user_id]: { ...draft, usedMinutes: event.target.value } }))} /></div>
                <div className="space-y-1"><Label htmlFor={`topup-min-${profile.user_id}`}>Saldo Top-up (min)</Label><Input id={`topup-min-${profile.user_id}`} type="number" min="0" step="0.01" value={draft.topupMinutes} onChange={(event) => setDrafts((current) => ({ ...current, [profile.user_id]: { ...draft, topupMinutes: event.target.value } }))} /></div>
              </div>
              <Button type="button" size="sm" onClick={() => void saveBalance(profile)} disabled={busy === profile.user_id}>{busy === profile.user_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar saldos</Button>
              {userVoices.length > 0 && <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">Vozes</p>{userVoices.map((voice) => <div key={voice.id} className="flex items-center justify-between gap-3 text-sm"><span>{voice.title} · {voice.is_active ? "ativa" : "inativa"}</span><Button type="button" size="sm" variant="destructive" onClick={() => void deleteVoice(voice)} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Excluir voz</Button></div>)}</div>}
            </div>;
          })}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
