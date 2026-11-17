import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, Loader2, MessageCircle, Mic, Trash2, Upload, Video } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isSafeWelcomeMediaUrl } from "@/lib/welcome-media";
import { buildWelcomeSequenceItems } from "@/lib/welcome-sequence";

type InstanceOption = { id: string; instance_name: string };
type MediaKind = "audio" | "image" | "video";
type WelcomeKind = MediaKind | "text";
type WelcomeDraft = {
  enabled: boolean;
  text_message: string;
  audio_url: string;
  audio_mimetype: string;
  image_url: string;
  image_mimetype: string;
  video_url: string;
  video_mimetype: string;
  send_order: WelcomeKind[];
};

const emptyDraft = (): WelcomeDraft => ({
  enabled: false,
  text_message: "",
  audio_url: "",
  audio_mimetype: "",
  image_url: "",
  image_mimetype: "",
  video_url: "",
  video_mimetype: "",
  send_order: ["audio", "image", "video", "text"],
});

const urlField: Record<MediaKind, "audio_url" | "image_url" | "video_url"> = {
  audio: "audio_url",
  image: "image_url",
  video: "video_url",
};

const mimeField: Record<MediaKind, "audio_mimetype" | "image_mimetype" | "video_mimetype"> = {
  audio: "audio_mimetype",
  image: "image_mimetype",
  video: "video_mimetype",
};

const labels: Record<MediaKind, string> = {
  audio: "Áudio de voz",
  image: "Imagem",
  video: "Vídeo",
};

export default function WelcomeMessages() {
  const { user } = useAuth();
  const { ownerUserId, isOwner, loading: membershipLoading } = useBusinessMembership();
  const { toast } = useToast();
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [draft, setDraft] = useState<WelcomeDraft>(emptyDraft);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<MediaKind | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    if (membershipLoading) return;
    if (!user || !ownerUserId || !isOwner) {
      setInstances([]);
      setSelectedInstanceId("");
      setLoadingInstances(false);
      return;
    }

    let active = true;
    setLoadingInstances(true);
    void (async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id,instance_name")
        .eq("user_id", ownerUserId)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        toast({ title: "Erro ao carregar instâncias", description: error.message, variant: "destructive" });
        setInstances([]);
        setSelectedInstanceId("");
      } else {
        const rows = data || [];
        setInstances(rows);
        setSelectedInstanceId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
      }
      setLoadingInstances(false);
    })();

    return () => { active = false; };
  }, [isOwner, membershipLoading, ownerUserId, toast, user]);

  useEffect(() => {
    if (!ownerUserId || !selectedInstanceId || !isOwner) {
      setDraft(emptyDraft());
      setLoadingConfig(false);
      return;
    }

    let active = true;
    setDraft(emptyDraft());
    setLoadingConfig(true);
    void (async () => {
      const { data, error } = await supabase
        .from("welcome_message_configs")
        .select("enabled,text_message,audio_url,audio_mimetype,image_url,image_mimetype,video_url,video_mimetype,send_order")
        .eq("user_id", ownerUserId)
        .eq("instance_id", selectedInstanceId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast({ title: "Erro ao carregar configuração", description: error.message, variant: "destructive" });
      } else if (data) {
        setDraft({
          enabled: data.enabled,
          text_message: data.text_message || "",
          audio_url: data.audio_url || "",
          audio_mimetype: data.audio_mimetype || "",
          image_url: data.image_url || "",
          image_mimetype: data.image_mimetype || "",
          video_url: data.video_url || "",
          video_mimetype: data.video_mimetype || "",
          send_order: (data.send_order || emptyDraft().send_order) as WelcomeKind[],
        });
      }
      setLoadingConfig(false);
    })();

    return () => { active = false; };
  }, [isOwner, ownerUserId, selectedInstanceId, toast]);

  useEffect(() => () => {
    discardRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  const uploadMedia = async (kind: MediaKind, file: File) => {
    if (!ownerUserId || !selectedInstanceId) return;
    if (!file.type.startsWith(`${kind}/`)) {
      toast({ title: "Formato inválido", description: `Escolha um ficheiro de ${labels[kind].toLowerCase()}.`, variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "O limite por ficheiro é 50 MB.", variant: "destructive" });
      return;
    }

    setUploading(kind);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
      const path = `${ownerUserId}/${selectedInstanceId}/welcome-${kind}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("store-assets").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const publicUrl = supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
      setDraft((current) => ({
        ...current,
        [urlField[kind]]: publicUrl,
        [mimeField[kind]]: file.type,
      }));
      toast({ title: `${labels[kind]} carregado`, description: "Guarde a configuração para ativar o envio." });
    } catch (error) {
      toast({
        title: "Não foi possível carregar o ficheiro",
        description: error instanceof Error ? error.message : "Erro de armazenamento.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const handleFile = (kind: MediaKind) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadMedia(kind, file);
  };

  const startOrStopRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Gravação indisponível", description: "Este navegador não permite gravar áudio.", variant: "destructive" });
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      discardRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        if (discardRecordingRef.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          toast({ title: "Áudio vazio", description: "A gravação não produziu um ficheiro válido.", variant: "destructive" });
          return;
        }
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        void uploadMedia("audio", new File([blob], `boas-vindas-${Date.now()}.${extension}`, { type: blob.type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      toast({
        title: "Não foi possível iniciar a gravação",
        description: error instanceof Error ? error.message : "Verifique a permissão do microfone.",
        variant: "destructive",
      });
    }
  };

  const save = async () => {
    if (!user || !ownerUserId || !selectedInstanceId) return;
    const configuredUrls = (["audio", "image", "video"] as const)
      .map((kind) => [labels[kind], draft[urlField[kind]].trim()] as const)
      .filter(([, url]) => Boolean(url));
    const invalidUrl = configuredUrls.find(([, url]) => !isSafeWelcomeMediaUrl(url));
    if (invalidUrl) {
      toast({ title: "URL inválida", description: `Verifique o endereço configurado para ${invalidUrl[0]}.`, variant: "destructive" });
      return;
    }
    const hasContent = Boolean(draft.text_message.trim() || configuredUrls.length);
    if (draft.enabled && !hasContent) {
      toast({ title: "Adicione uma mensagem", description: "Ative a automação depois de configurar pelo menos um conteúdo.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("welcome_message_configs").upsert({
        user_id: ownerUserId,
        instance_id: selectedInstanceId,
        enabled: draft.enabled,
        text_message: draft.text_message.trim() || null,
        audio_url: draft.audio_url.trim() || null,
        audio_mimetype: draft.audio_mimetype || null,
        image_url: draft.image_url.trim() || null,
        image_mimetype: draft.image_mimetype || null,
        video_url: draft.video_url.trim() || null,
        video_mimetype: draft.video_mimetype || null,
        send_order: draft.send_order,
        updated_at: new Date().toISOString(),
      }, { onConflict: "instance_id" });
      if (error) {
        toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Configuração guardada", description: "As mensagens de boas-vindas foram atualizadas." });
    } catch (error) {
      toast({
        title: "Erro ao guardar",
        description: error instanceof Error ? error.message : "Erro de ligação.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderMediaCard = (kind: MediaKind) => {
    const value = draft[urlField[kind]];
    const isUploading = uploading === kind;
    const accept = kind === "audio" ? "audio/*" : kind === "image" ? "image/*" : "video/*";

    return (
      <Card key={kind} className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {kind === "audio" ? <Mic className="h-4 w-4" /> : kind === "image" ? <ImageIcon className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            {labels[kind]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${kind}-url`}>URL externa ou do ficheiro carregado</Label>
            <Input
              id={`${kind}-url`}
              type="url"
              placeholder="https://..."
              value={value}
              onChange={(event) => setDraft((current) => ({
                ...current,
                [urlField[kind]]: event.target.value,
                [mimeField[kind]]: "",
              }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Label htmlFor={`${kind}-file`} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? "A carregar..." : "Carregar ficheiro"}
            </Label>
            <Input id={`${kind}-file`} type="file" accept={accept} className="sr-only" onChange={handleFile(kind)} disabled={isUploading} />
            {kind === "audio" && (
              <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" onClick={startOrStopRecording} disabled={isUploading}>
                <Mic className="mr-2 h-4 w-4" />{recording ? "Terminar gravação" : "Gravar áudio"}
              </Button>
            )}
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDraft((current) => ({ ...current, [urlField[kind]]: "", [mimeField[kind]]: "" }))}
              >
                <Trash2 className="mr-2 h-4 w-4" />Remover
              </Button>
            )}
          </div>
          {value && kind === "audio" && <audio controls src={value} className="w-full" />}
          {value && kind === "image" && <img src={value} alt="Pré-visualização da mensagem de boas-vindas" className="max-h-48 max-w-full rounded-md border object-contain" />}
          {value && kind === "video" && <video controls src={value} className="max-h-56 w-full rounded-md border" />}
        </CardContent>
      </Card>
    );
  };

  const itemLabels: Record<WelcomeKind, string> = { audio: "Áudio (mensagem de voz)", image: "Imagem", video: "Vídeo", text: "Texto de saudação" };
  const orderedItems = buildWelcomeSequenceItems(draft).map((item) => item.kind);
  const moveSequenceItem = (kind: WelcomeKind, offset: -1 | 1) => {
    const index = orderedItems.indexOf(kind);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= orderedItems.length) return;
    const next = [...orderedItems];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft((current) => ({ ...current, send_order: next }));
  };

  return (
    <DashboardShell title="Mensagens de Boas-Vindas" description="Configure a primeira mensagem enviada a cada novo contacto.">
      {!membershipLoading && !isOwner ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">A configuração das mensagens de boas-vindas está disponível apenas para o proprietário da empresa.</CardContent></Card>
      ) : loadingInstances ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar instâncias...</CardContent></Card>
      ) : instances.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Conecte uma instância de WhatsApp antes de configurar as mensagens de boas-vindas.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          <Card className="border-border/60">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="font-semibold">Automação do primeiro contacto</h2>
                <p className="text-sm text-muted-foreground">A sequência é enviada uma única vez por número e instância.</p>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="welcome-enabled" className="text-sm font-medium">{draft.enabled ? "Ativada" : "Desativada"}</Label>
                <Switch id="welcome-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} />
              </div>
            </CardContent>
          </Card>

          {instances.length > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="welcome-instance">Linha de WhatsApp</Label>
              <select
                id="welcome-instance"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedInstanceId}
                disabled={loadingConfig || uploading !== null || recording}
                onChange={(event) => setSelectedInstanceId(event.target.value)}
              >
                {instances.map((instance, index) => <option key={instance.id} value={instance.id}>Linha {index + 1}</option>)}
              </select>
            </div>
          )}

          {loadingConfig ? (
            <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar configuração...</CardContent></Card>
          ) : (
            <>
              <Card className="border-border/60">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" />Texto de saudação</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Label htmlFor="welcome-text">Mensagem (opcional)</Label>
                  <Textarea
                    id="welcome-text"
                    maxLength={4000}
                    className="min-h-28"
                    placeholder="Olá! Obrigado por entrar em contacto com a nossa empresa..."
                    value={draft.text_message}
                    onChange={(event) => setDraft((current) => ({ ...current, text_message: event.target.value }))}
                  />
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-3">
                {renderMediaCard("audio")}
                {renderMediaCard("image")}
                {renderMediaCard("video")}
              </div>

              <Card className="border-border/60">
                <CardHeader><CardTitle className="text-base">Pré-visualização da ordem de envio</CardTitle></CardHeader>
                <CardContent>
                  {orderedItems.length ? (
                    <ol className="space-y-2">
                      {orderedItems.map((item, index) => (
                        <li key={item} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                          {itemLabels[item]}
                          <div className="ml-auto flex gap-1">
                            <Button type="button" size="icon" variant="ghost" aria-label={`Mover ${itemLabels[item]} para cima`} disabled={index === 0} onClick={() => moveSequenceItem(item, -1)}><ArrowUp className="h-4 w-4" /></Button>
                            <Button type="button" size="icon" variant="ghost" aria-label={`Mover ${itemLabels[item]} para baixo`} disabled={index === orderedItems.length - 1} onClick={() => moveSequenceItem(item, 1)}><ArrowDown className="h-4 w-4" /></Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-muted-foreground">Adicione um ou mais conteúdos para definir a sequência.</p>}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving || uploading !== null || recording}>
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...</> : "Guardar configuração"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
