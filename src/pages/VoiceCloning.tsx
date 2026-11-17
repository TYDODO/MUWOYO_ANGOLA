import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Check, Clock3, Heart, Loader2, Mic, Play, Plus, Search, Settings2, Square, Trash2, Upload, Volume2 } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { translateVoiceLanguages } from "@/lib/voice-library";
import { DEFAULT_VOICE_TUNING, parseVoiceTuning, type VoiceTuning } from "@/lib/voice-tuning";

type AudioBalance = {
  eligible: boolean;
  is_trial: boolean;
  plan_name: string | null;
  audio_unlimited: boolean;
  audio_enabled: boolean;
  plan_seconds_total: number;
  plan_seconds_used: number;
  plan_seconds_remaining: number | null;
  trial_seconds_total: number;
  trial_seconds_used: number;
  trial_seconds_remaining: number;
  topup_seconds_balance: number;
  total_seconds_available: number | null;
  period_ends_at: string | null;
  subscription_expires_at: string | null;
  max_cloned_voices: number;
};
type VoiceModel = { id: string; user_id: string; model_id: string; title: string; is_active: boolean; created_at: string };
type VoiceGeneration = { id: string; voice_model_id: string; generation_number: number; text_input: string; storage_path: string | null; duration_seconds: number | null; status: string; created_at: string };
type FishVoice = {
  reference_id: string;
  name: string;
  description_pt: string;
  description?: string;
  languages: string[];
  gender: string | null;
  country?: string | null;
  preview_url: string | null;
  task_count?: number;
  like_count?: number;
  author?: string | null;
};
type VoiceSettings = { active_voice_reference_id: string | null; voice_source: "cloned" | "library" | null; voice_name: string | null; voice_tuning: VoiceTuning };
type TopupRequest = { id: string; minutes: number; amount_kz: number; payment_id: string; status: string; submitted_at: string; rejection_reason: string | null };
type PaymentMethod = { id: string; label: string; iban: string | null; account_holder_name: string | null; bank_name: string | null; entity_name: string | null; entity_number: string | null; phone_number: string | null; instructions: string | null };

function parseBalance(value: unknown): AudioBalance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.eligible !== "boolean" || typeof record.audio_enabled !== "boolean") return null;
  return {
    eligible: record.eligible,
    is_trial: record.is_trial === true,
    plan_name: typeof record.plan_name === "string" ? record.plan_name : null,
    audio_unlimited: record.audio_unlimited === true,
    audio_enabled: record.audio_enabled,
    plan_seconds_total: Number(record.plan_seconds_total || 0),
    plan_seconds_used: Number(record.plan_seconds_used || 0),
    plan_seconds_remaining: record.plan_seconds_remaining === null ? null : Number(record.plan_seconds_remaining || 0),
    trial_seconds_total: Number(record.trial_seconds_total || 0),
    trial_seconds_used: Number(record.trial_seconds_used || 0),
    trial_seconds_remaining: Number(record.trial_seconds_remaining || 0),
    topup_seconds_balance: Number(record.topup_seconds_balance || 0),
    total_seconds_available: record.total_seconds_available === null ? null : Number(record.total_seconds_available || 0),
    period_ends_at: typeof record.period_ends_at === "string" ? record.period_ends_at : null,
    subscription_expires_at: typeof record.subscription_expires_at === "string" ? record.subscription_expires_at : null,
    max_cloned_voices: Number(record.max_cloned_voices || 0),
  };
}

function formatMinutes(seconds: number | null | undefined) {
  return `${(Math.max(0, Number(seconds || 0)) / 60).toLocaleString("pt-AO", { maximumFractionDigits: 2 })} min`;
}

function formatVoiceCountry(country: string) {
  try {
    return new Intl.DisplayNames(["pt"], { type: "region" }).of(country.toUpperCase()) || country;
  } catch {
    return country;
  }
}

function getAudioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(audio.duration)) resolve(audio.duration);
      else reject(new Error("Não foi possível ler a duração do áudio."));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("O ficheiro de áudio não pode ser lido."));
    };
    audio.src = url;
  });
}

export default function VoiceCloning() {
  const { user } = useAuth();
  const { ownerUserId, isOwner, loading: membershipLoading } = useBusinessMembership();
  const { toast } = useToast();
  const [balance, setBalance] = useState<AudioBalance | null>(null);
  const [voices, setVoices] = useState<VoiceModel[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    active_voice_reference_id: null,
    voice_source: null,
    voice_name: null,
    voice_tuning: DEFAULT_VOICE_TUNING,
  });
  const [fishVoices, setFishVoices] = useState<FishVoice[]>([]);
  const [favoriteVoices, setFavoriteVoices] = useState<FishVoice[]>([]);
  const [importedVoice, setImportedVoice] = useState<FishVoice | null>(null);
  const [curatedVoices, setCuratedVoices] = useState<FishVoice[]>([]);
  const [voiceTab, setVoiceTab] = useState<"cloned" | "library">("cloned");
  const [libraryMode, setLibraryMode] = useState<"recommended" | "explore">("recommended");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryGender, setLibraryGender] = useState("all");
  const [libraryCountry, setLibraryCountry] = useState("all");
  const [libraryLanguage, setLibraryLanguage] = useState("pt");
  const [librarySort, setLibrarySort] = useState("task_count");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [manualReferenceId, setManualReferenceId] = useState("");
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [curatedLoaded, setCuratedLoaded] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryWindowLimited, setLibraryWindowLimited] = useState(false);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>([]);
  const [unavailableFavoriteIds, setUnavailableFavoriteIds] = useState<string[]>([]);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [generations, setGenerations] = useState<VoiceGeneration[]>([]);
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [title, setTitle] = useState("");
  const [sample, setSample] = useState<File | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [sampleDuration, setSampleDuration] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [analyzingSample, setAnalyzingSample] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [testText, setTestText] = useState("Olá! Obrigado por entrar em contacto com a nossa empresa.");
  const [playingUrl, setPlayingUrl] = useState("");
  const [playingGenerationId, setPlayingGenerationId] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [minutes, setMinutes] = useState(20);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [proof, setProof] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!user || !ownerUserId || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [balanceResult, voiceResult, generationResult, requestResult, methodResult, settingsResult] = await Promise.all([
      supabase.rpc("get_audio_balance", { p_user_id: ownerUserId }),
      supabase.from("audio_voice_models").select("id,user_id,model_id,title,is_active,created_at").eq("user_id", ownerUserId).order("created_at", { ascending: false }),
      supabase.from("audio_voice_generations").select("id,voice_model_id,generation_number,text_input,storage_path,duration_seconds,status,created_at").eq("user_id", ownerUserId).order("generation_number", { ascending: true }),
      supabase.from("audio_topup_requests").select("id,minutes,amount_kz,payment_id,status,submitted_at,rejection_reason").eq("user_id", ownerUserId).order("submitted_at", { ascending: false }).limit(10),
      supabase.from("payment_methods").select("id,label,iban,account_holder_name,bank_name,entity_name,entity_number,phone_number,instructions").eq("is_active", true).order("updated_at", { ascending: false }),
      supabase.functions.invoke("list-fish-voices", { body: { action: "settings" } }),
    ]);
    const error = balanceResult.error || voiceResult.error || generationResult.error || requestResult.error || methodResult.error || settingsResult.error;
    if (error) {
      toast({ title: "Erro ao carregar gestão de voz", description: error.message, variant: "destructive" });
    } else {
      setBalance(parseBalance(balanceResult.data));
      setVoices(voiceResult.data || []);
      setGenerations(generationResult.data || []);
      setRequests(requestResult.data || []);
      setMethods(methodResult.data || []);
      if (settingsResult.data?.settings) {
        const settings = settingsResult.data.settings;
        setVoiceSettings({
          active_voice_reference_id: settings.active_voice_reference_id || null,
          voice_source: settings.voice_source === "cloned" || settings.voice_source === "library" ? settings.voice_source : null,
          voice_name: settings.voice_name || null,
          voice_tuning: parseVoiceTuning(settings.voice_tuning),
        });
        setFavoriteVoiceIds(Array.isArray(settings.favorite_voice_ids) ? settings.favorite_voice_ids : []);
      }
      setPaymentMethodId((current) => methodResult.data?.some((method) => method.id === current) ? current : methodResult.data?.[0]?.id || "");
    }
    setLoading(false);
  }, [isOwner, ownerUserId, toast, user]);

  useEffect(() => { if (!membershipLoading) void load(); }, [load, membershipLoading]);
  useEffect(() => () => {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state !== "inactive") recorder?.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!sample) {
      setSampleUrl("");
      return;
    }
    const url = URL.createObjectURL(sample);
    setSampleUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);

  useEffect(() => {
    if (!playingUrl || !audioRef.current) return;
    void audioRef.current.play().catch((error: unknown) => {
      toast({ title: "Não foi possível reproduzir o áudio", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    });
  }, [playingUrl, toast]);

  const handleSample = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = "";
    if (file && !file.type.startsWith("audio/")) {
      toast({ title: "Ficheiro inválido", description: "Escolha um ficheiro de áudio.", variant: "destructive" });
      return;
    }
    if (!file) return;
    setAnalyzingSample(true);
    try {
      const duration = await getAudioDuration(file);
      if (duration < 15 || duration > 30) {
        toast({ title: "Duração fora do intervalo", description: "A amostra deve ter entre 15 e 30 segundos.", variant: "destructive" });
        return;
      }
      setSample(file);
      setSampleDuration(duration);
      setTitle("");
    } catch (error) {
      toast({ title: "Áudio inválido", description: error instanceof Error ? error.message : "Não foi possível analisar o áudio.", variant: "destructive" });
    } finally {
      setAnalyzingSample(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
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
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream?.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
        if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
        recordingTimeoutRef.current = null;
        recordingIntervalRef.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          toast({ title: "Áudio vazio", description: "A gravação não produziu um ficheiro válido.", variant: "destructive" });
          return;
        }
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-sample.${extension}`, { type: blob.type });
        const elapsed = Math.min(30, Math.max(0, (Date.now() - (recordingStartedAtRef.current || Date.now())) / 1000));
        setRecordingSeconds(Math.floor(elapsed));
        setAnalyzingSample(true);
        try {
          const duration = await getAudioDuration(file).catch(() => elapsed);
          if (duration < 15 || duration > 30) {
            toast({ title: "Duração fora do intervalo", description: "A gravação deve ter entre 15 e 30 segundos. Grave novamente.", variant: "destructive" });
            return;
          }
          setSample(file);
          setSampleDuration(duration);
          setTitle("");
        } catch (error) {
          toast({ title: "Áudio inválido", description: error instanceof Error ? error.message : "Não foi possível analisar o áudio.", variant: "destructive" });
        } finally {
          setAnalyzingSample(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setRecording(true);
      recordingIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.min(30, Math.floor((Date.now() - (recordingStartedAtRef.current || Date.now())) / 1000));
        setRecordingSeconds(elapsed);
      }, 250);
      recordingTimeoutRef.current = window.setTimeout(() => {
        setRecordingSeconds(30);
        if (recorder.state !== "inactive") recorder.stop();
      }, 30000);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      toast({ title: "Não foi possível iniciar a gravação", description: error instanceof Error ? error.message : "Verifique a permissão do microfone.", variant: "destructive" });
    }
  };

  const cloneVoice = async () => {
    if (!sample || !title.trim()) {
      toast({ title: "Complete os dados da voz", description: "Indique um nome e grave ou selecione uma amostra de áudio.", variant: "destructive" });
      return;
    }
    if (sample.size > 25 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "O limite por amostra é 25 MB.", variant: "destructive" });
      return;
    }
    setBusy("clone");
    const form = new FormData();
    form.set("action", "clone");
    form.set("title", title.trim());
    form.set("audio", sample, sample.name);
    const { data, error } = await supabase.functions.invoke("clone-voice", { body: form });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível clonar a voz", description: data?.error || error?.message || "O serviço de voz não conseguiu concluir o pedido.", variant: "destructive" });
      return;
    }
    toast({ title: "Voz clonada", description: data?.is_active ? "A voz ficou ativa." : "A voz foi criada inativa porque o limite de vozes ativas do plano já foi atingido." });
    setTitle("");
    setSample(null);
    setSampleDuration(null);
    await load();
  };

  const discardSample = () => {
    setSample(null);
    setSampleDuration(null);
    setTitle("");
  };

  const manageVoice = async (action: "activate" | "deactivate" | "delete", voice: VoiceModel) => {
    if (action === "delete" && !window.confirm(`Excluir a voz "${voice.title}" também a remove do serviço de voz?`)) return;
    setBusy(voice.id);
    const form = new FormData();
    form.set("action", action);
    form.set("model_id", voice.model_id);
    const { data, error } = await supabase.functions.invoke("clone-voice", { body: form });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível atualizar a voz", description: data?.error || error?.message || "O serviço de voz não conseguiu concluir o pedido.", variant: "destructive" });
      return;
    }
    toast({ title: action === "delete" ? "Voz removida" : action === "activate" ? "Voz ativada" : "Voz desativada" });
    await load();
  };

  const loadFishVoices = useCallback(async (
    title = librarySearch,
    pageNumber = 1,
    append = false,
    language = libraryLanguage,
    sortBy = librarySort,
  ) => {
    setLibraryLoading(true);
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "list", page_size: 20, page_number: pageNumber, title: title.trim(), language, sort_by: sortBy },
    });
    setLibraryLoading(false);
    if (error || data?.error) {
      toast({ title: "Não foi possível carregar a biblioteca", description: data?.error || error?.message || "O serviço de voz não respondeu.", variant: "destructive" });
      return;
    }
    const models = Array.isArray(data?.models) ? data.models as FishVoice[] : [];
    setFishVoices((current) => append
      ? [...current, ...models.filter((voice) => !current.some((item) => item.reference_id === voice.reference_id))]
      : models);
    setLibraryPage(pageNumber);
    setLibraryTotal(typeof data?.total === "number" ? data.total : null);
    setLibraryHasMore(data?.has_more === true);
    setLibraryWindowLimited(data?.window_limited === true);
    setLibraryLoaded(true);
  }, [libraryLanguage, librarySearch, librarySort, toast]);

  const loadCuratedVoices = async () => {
    setLibraryLoading(true);
    const { data, error } = await supabase.functions.invoke("list-fish-voices", { body: { action: "curated_list" } });
    setLibraryLoading(false);
    if (error || data?.error) {
      console.warn("curated_voices_unavailable", data?.error || error?.message || "unknown_error");
      setCuratedVoices([]);
      setCuratedLoaded(true);
      return;
    }
    setCuratedVoices(Array.isArray(data?.items) ? data.items as FishVoice[] : []);
    setCuratedLoaded(true);
  };

  const lookupVoice = async () => {
    const referenceId = manualReferenceId.trim();
    if (!referenceId) return;
    setBusy("voice-lookup");
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "lookup", reference_id: referenceId },
    });
    setBusy("");
    if (error || data?.error || !data?.item) {
      toast({ title: "Não foi possível importar esta voz", description: data?.error || error?.message || "Verifique o identificador e tente novamente.", variant: "destructive" });
      return;
    }
    const voice = data.item as FishVoice;
    setImportedVoice(voice);
    setLibraryMode("explore");
    setManualReferenceId("");
    toast({ title: "Voz encontrada", description: `${voice.name} foi adicionada aos resultados.` });
  };

  const toggleFavorite = async (voice: FishVoice) => {
    const isFavorite = favoriteVoiceIds.includes(voice.reference_id);
    setBusy(`favorite:${voice.reference_id}`);
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "favorite", reference_id: voice.reference_id, favorite: !isFavorite },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível atualizar os favoritos", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    const updatedIds = Array.isArray(data?.favorite_voice_ids) ? data.favorite_voice_ids as string[] : [];
    setFavoriteVoiceIds(updatedIds);
    setFavoriteVoices((current) => !isFavorite
      ? [...current.filter((item) => item.reference_id !== voice.reference_id), voice]
      : current.filter((item) => item.reference_id !== voice.reference_id));
  };

  const showFavoriteVoices = async () => {
    if (showFavoritesOnly) {
      setShowFavoritesOnly(false);
      return;
    }
    setBusy("favorite-list");
    const { data, error } = await supabase.functions.invoke("list-fish-voices", { body: { action: "favorite_list" } });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível carregar os favoritos", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setFavoriteVoiceIds(Array.isArray(data?.favorite_voice_ids) ? data.favorite_voice_ids : []);
    setFavoriteVoices(Array.isArray(data?.models) ? data.models as FishVoice[] : []);
    const unavailableIds = Array.isArray(data?.unavailable_reference_ids)
      ? data.unavailable_reference_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    setUnavailableFavoriteIds(unavailableIds);
    setLibraryLanguage("all");
    setLibraryGender("all");
    setLibraryCountry("all");
    setLibrarySearch("");
    setLibraryMode("explore");
    setShowFavoritesOnly(true);
    if (unavailableIds.length) {
      toast({
        title: "Algumas favoritas já não estão disponíveis",
        description: "As restantes vozes continuam na lista. Pode remover as indisponíveis dos favoritos ao encontrá-las novamente.",
      });
    }
  };

  const selectVoice = async (referenceId: string, source: "cloned" | "library", name: string) => {
    setBusy("voice-selection");
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "select", reference_id: referenceId, source, name },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível selecionar a voz", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setManualReferenceId("");
    toast({ title: "Voz selecionada", description: `${name} está ativa para o atendente.` });
    await load();
  };

  const playPreview = (url: string, referenceId: string) => {
    if (playingUrl === url && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
      return;
    }
    setPlayingGenerationId(`preview:${referenceId}`);
    setPlayingUrl(url);
  };

  const playVoicePreview = async (voice: FishVoice) => {
    if (voice.preview_url) {
      playPreview(voice.preview_url, voice.reference_id);
      return;
    }
    setBusy(`preview:${voice.reference_id}`);
    const { data, error } = await supabase.functions.invoke("test-voice", {
      body: { reference_id: voice.reference_id, preview: true, voice_tuning: voiceSettings.voice_tuning },
    });
    setBusy("");
    if (error || data?.error || typeof data?.audio_base64 !== "string") {
      toast({ title: "Prévia indisponível", description: data?.error || error?.message || "Esta voz não tem uma amostra de áudio.", variant: "destructive" });
      return;
    }
    setPlayingGenerationId(`preview:${voice.reference_id}`);
    setPlayingUrl(`data:audio/mpeg;base64,${data.audio_base64}`);
  };

  useEffect(() => {
    if (libraryMode !== "explore" || showFavoritesOnly) return;
    const timeout = window.setTimeout(() => {
      void loadFishVoices(librarySearch, 1, false, libraryLanguage, librarySort);
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [libraryLanguage, libraryMode, librarySearch, librarySort, loadFishVoices, showFavoritesOnly]);

  const saveVoiceTuning = async (voiceTuning = voiceSettings.voice_tuning) => {
    setBusy("voice-tuning");
    const { data, error } = await supabase.functions.invoke("list-fish-voices", {
      body: { action: "save_tuning", voice_tuning: voiceTuning },
    });
    setBusy("");
    if (error || data?.error) {
      toast({ title: "Não foi possível guardar os ajustes", description: data?.error || error?.message || "Tente novamente.", variant: "destructive" });
      return;
    }
    setVoiceSettings((current) => ({ ...current, voice_tuning: parseVoiceTuning(data.voice_tuning) }));
    toast({ title: "Ajustes guardados", description: "Os novos parâmetros serão usados nas próximas respostas de voz." });
  };

  const testVoice = async (voice: VoiceModel) => {
    if (!testText.trim() || testText.length > 500) return;
    setBusy(voice.id);
    const { data, error } = await supabase.functions.invoke("test-voice", { body: { model_id: voice.model_id, text: testText.trim(), voice_tuning: voiceSettings.voice_tuning } });
    setBusy("");
    if (error || data?.error || typeof data?.id !== "string") {
      toast({ title: "Não foi possível testar a voz", description: data?.error || error?.message || "O serviço de voz não devolveu áudio.", variant: "destructive" });
      return;
    }
    setPlayingGenerationId(data.id);
    await load();
    const { data: signedUrl, error: signedUrlError } = await supabase.storage
      .from("audio-generations").createSignedUrl(`${ownerUserId}/${voice.model_id}/${data.id}.mp3`, 3600);
    if (signedUrlError) {
      toast({ title: "Geração guardada, mas não foi possível abrir o áudio", description: signedUrlError.message, variant: "destructive" });
      return;
    }
    setPlayingUrl(signedUrl.signedUrl);
  };

  const playGeneration = async (generation: VoiceGeneration) => {
    if (!ownerUserId || !generation.storage_path || generation.status !== "ready") return;
    if (playingGenerationId === generation.id && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play();
      return;
    }
    const { data, error } = await supabase.storage.from("audio-generations").createSignedUrl(generation.storage_path, 3600);
    if (error) {
      toast({ title: "Não foi possível abrir o áudio", description: error.message, variant: "destructive" });
      return;
    }
    setPlayingGenerationId(generation.id);
    setPlayingUrl(data.signedUrl);
  };

  const stopPlayback = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlayingUrl("");
    setPlayingGenerationId("");
  };

  const submitTopup = async () => {
    if (!user || !ownerUserId || !proof || minutes < 20 || !paymentMethodId) {
      toast({ title: "Dados incompletos", description: "Escolha pelo menos 20 minutos, método de pagamento e comprovativo.", variant: "destructive" });
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(proof.type) || proof.size > 10 * 1024 * 1024) {
      toast({ title: "Comprovativo inválido", description: "Envie PDF ou imagem (JPG, PNG, WebP) até 10 MB.", variant: "destructive" });
      return;
    }
    setBusy("topup");
    const paymentId = `MWY-AUDIO-${Date.now()}-${user.id.slice(0, 8).toUpperCase()}`;
    const path = `${user.id}/audio-topups/${paymentId}-${proof.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const upload = await supabase.storage.from("payment-proofs").upload(path, proof, { contentType: proof.type, upsert: false });
    if (upload.error) {
      setBusy("");
      toast({ title: "Erro no upload", description: upload.error.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("create_audio_topup_request", {
      p_minutes: minutes,
      p_payment_method_id: paymentMethodId,
      p_payment_id: paymentId,
      p_proof_path: path,
    });
    if (error) {
      await supabase.storage.from("payment-proofs").remove([path]);
      setBusy("");
      toast({ title: "Não foi possível enviar o comprovativo", description: error.message, variant: "destructive" });
      return;
    }
    setBusy("");
    setTopupOpen(false);
    setProof(null);
    setMinutes(20);
    toast({ title: "Comprovativo enviado", description: "Os minutos serão creditados depois da validação pela equipa." });
    await load();
  };

  const copy = async (value: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copiado", description: "Informação copiada para a área de transferência." });
  };

  const planMinutesRemaining = balance?.eligible && balance.audio_unlimited ? null : balance?.plan_seconds_remaining;
  const totalSeconds = balance?.total_seconds_available;
  const exploreVoices = importedVoice && !fishVoices.some((voice) => voice.reference_id === importedVoice.reference_id)
    ? [importedVoice, ...fishVoices]
    : fishVoices;
  const visibleFishVoices = (showFavoritesOnly ? favoriteVoices : libraryMode === "recommended" ? curatedVoices : exploreVoices).filter((voice) => {
    const genderMatches = libraryGender === "all" || (voice.gender || "").toLowerCase() === libraryGender;
    const countryMatches = libraryMode !== "explore" || libraryCountry === "all" || voice.country?.toLowerCase() === libraryCountry.toLowerCase();
    const languageLabels: Record<string, string> = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês" };
    const languageMatches = libraryMode === "recommended" || libraryLanguage === "all"
      || voice.languages.some((language) => language.toLowerCase() === libraryLanguage || translateVoiceLanguages([language]).includes(languageLabels[libraryLanguage]));
    const favoriteMatches = !showFavoritesOnly || favoriteVoiceIds.includes(voice.reference_id);
    const query = libraryMode === "explore" ? librarySearch.trim().toLowerCase() : "";
    const queryMatches = !query || [voice.name, voice.description_pt, voice.gender, ...translateVoiceLanguages(voice.languages)]
      .filter(Boolean).join(" ").toLowerCase().includes(query);
    return genderMatches && countryMatches && languageMatches && favoriteMatches && queryMatches;
  });
  const countryOptions = [...new Set(exploreVoices.map((voice) => voice.country?.trim()).filter((country): country is string => Boolean(country)))].sort((a, b) => a.localeCompare(b, "pt"));

  return (
    <DashboardShell title="Clonagem & Mensagens de Voz" description="Gira vozes clonadas e acompanhe o consumo mensal e os minutos extra.">
      {!membershipLoading && !isOwner ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">A gestão de vozes está disponível apenas para o proprietário da empresa.</CardContent></Card>
      ) : loading ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar saldo e vozes...</CardContent></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{balance?.is_trial ? "Áudio de teste" : "Minutos do plano"}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{balance?.is_trial ? `${formatMinutes(balance.trial_seconds_remaining)} restantes` : balance?.eligible && balance.audio_unlimited ? "Ilimitados" : `${formatMinutes(planMinutesRemaining)} restantes`}</p><p className="mt-1 text-xs text-muted-foreground">{balance?.is_trial ? `${formatMinutes(balance.trial_seconds_total)} gratuitos · ${formatMinutes(balance.trial_seconds_used)} usados` : balance?.eligible && balance.audio_unlimited ? "Enterprise" : `${formatMinutes(balance?.plan_seconds_total)} incluídos · ${formatMinutes(balance?.plan_seconds_used)} usados`}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo extra (Top-up)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatMinutes(balance?.topup_seconds_balance)}</p><p className="mt-1 text-xs text-muted-foreground">Minutos acumulados; não expiram.</p></CardContent></Card>
            <Card className="border-primary/30"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total disponível</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{balance?.eligible && totalSeconds === null ? "Ilimitado" : formatMinutes(totalSeconds)}</p><p className="mt-1 text-xs text-muted-foreground">{balance?.eligible ? "Saldo de áudio ativo" : "Saldo congelado até ativar um plano elegível"}</p></CardContent></Card>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button onClick={() => setTopupOpen(true)}><Plus className="mr-2 h-4 w-4" />Comprar Minutos (Top-up)</Button>
          </div>

          {!balance?.eligible && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{balance?.is_trial ? "Minutos de teste esgotados" : "Clonagem de voz indisponível neste plano"}</p><p className="text-sm text-muted-foreground">{balance?.is_trial ? "Ative o Muwoyo Growth, Big ou Enterprise para voltar a clonar vozes e enviar áudio. O saldo Top-up permanece guardado." : "O saldo Top-up permanece guardado e volta a ficar disponível quando renovar ou ativar o Muwoyo Growth, Big ou Enterprise."}</p></div>
                <Button asChild><a href="/recargas">Fazer upgrade para Growth</a></Button>
              </CardContent>
            </Card>
          )}

          {balance?.eligible && (
            <Tabs value={voiceTab} onValueChange={(value) => {
              const nextTab = value as "cloned" | "library";
              setVoiceTab(nextTab);
              if (nextTab === "library") void loadCuratedVoices();
            }}>
              <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit [&>button]:whitespace-normal [&>button]:px-2 [&>button]:text-xs sm:[&>button]:text-sm">
                <TabsTrigger value="cloned">Minha Voz Clonada</TabsTrigger>
                <TabsTrigger value="library">Biblioteca de Vozes</TabsTrigger>
              </TabsList>
              <TabsContent value="cloned" className="space-y-4">
              {voiceSettings.active_voice_reference_id && voiceSettings.voice_source === "library" && (
                <Card className="border-primary/40 bg-primary/5">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="flex items-center gap-2 font-semibold text-primary"><Check className="h-4 w-4" />Voz principal do agente de IA</p><p className="mt-1 text-sm">{voiceSettings.voice_name || voiceSettings.active_voice_reference_id}</p><p className="text-xs text-muted-foreground">Voz selecionada da biblioteca para as respostas de áudio.</p></div>
                    <Button type="button" variant="outline" onClick={() => setVoiceTab("library")}>Ver biblioteca</Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><AudioLines className="h-5 w-5" />Adicionar uma voz clonada</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Grave ou carregue uma amostra limpa entre 15 e 30 segundos.</p>
                  {!sample ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Label htmlFor="voice-file" className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm ${analyzingSample || recording ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-accent"}`}><Upload className="h-4 w-4" />Carregar áudio</Label>
                        <Input id="voice-file" type="file" accept="audio/*" className="sr-only" onChange={(event) => void handleSample(event)} disabled={analyzingSample || recording} />
                        <Button type="button" variant={recording ? "destructive" : "outline"} onClick={() => void toggleRecording()} disabled={analyzingSample}><Mic className="mr-2 h-4 w-4" />{recording ? "Terminar gravação" : "Gravar voz"}</Button>
                        {recording && <span className="rounded-md bg-destructive/10 px-3 py-2 font-mono text-sm font-semibold text-destructive" role="timer" aria-live="off">{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")} / 00:30</span>}
                      </div>
                      {recording && <p className="text-sm text-muted-foreground">A gravação termina automaticamente aos 30 segundos.</p>}
                      {analyzingSample && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A analisar a duração da amostra...</p>}
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-md border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><p className="font-medium">Amostra analisada</p><p className="text-xs text-muted-foreground">{sample.name} · {sampleDuration?.toFixed(1)} s · {(sample.size / 1024 / 1024).toFixed(2)} MB</p></div>
                        <Button type="button" size="sm" variant="outline" onClick={discardSample}><Trash2 className="mr-2 h-4 w-4" />Eliminar e gravar novamente</Button>
                      </div>
                      {sampleUrl && <audio controls src={sampleUrl} className="w-full" />}
                      <div className="space-y-2">
                        <Label htmlFor="voice-title">2. Nome da voz</Label>
                        <Input id="voice-title" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Voz da empresa" />
                      </div>
                      <Button onClick={() => void cloneVoice()} disabled={busy === "clone" || !title.trim()}>{busy === "clone" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A clonar...</> : "Clonar voz"}</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Vozes clonadas · {voices.filter((voice) => voice.is_active).length}/{balance.max_cloned_voices >= 2147483647 ? "∞" : balance.max_cloned_voices} ativas</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="voice-test-text">Texto para gerar áudio de pré-visualização</Label><Textarea id="voice-test-text" maxLength={500} value={testText} onChange={(event) => setTestText(event.target.value)} /><p className="text-right text-xs text-muted-foreground">{testText.length}/500 caracteres · limite de 3 gerações por voz</p></div>
                  {voices.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Ainda não existem vozes clonadas.</p> : voices.map((voice) => (
                    <div key={voice.id} className="space-y-3 rounded-md border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="font-medium">{voice.title} {voice.is_active && <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" />Ativa no plano</span>}{voiceSettings.voice_source === "cloned" && voiceSettings.active_voice_reference_id === voice.model_id && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><Check className="h-3 w-3" />Voz principal do agente de IA</span>}</p><p className="text-xs text-muted-foreground">Criada em {new Date(voice.created_at).toLocaleDateString("pt-AO")}</p></div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void testVoice(voice)} disabled={Boolean(busy) || !voice.is_active || !testText.trim() || generations.filter((generation) => generation.voice_model_id === voice.model_id).length >= 3}>{busy === voice.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A gerar...</> : <><Play className="mr-2 h-4 w-4" />Gerar áudio</>}</Button>
                          <Button size="sm" onClick={() => void selectVoice(voice.model_id, "cloned", voice.title)} disabled={Boolean(busy) || (voiceSettings.voice_source === "cloned" && voiceSettings.active_voice_reference_id === voice.model_id)}>{voiceSettings.voice_source === "cloned" && voiceSettings.active_voice_reference_id === voice.model_id ? "Selecionada" : "Selecionar para o atendente"}</Button>
                          <Button size="sm" variant="outline" onClick={() => void manageVoice(voice.is_active ? "deactivate" : "activate", voice)} disabled={Boolean(busy)}>{voice.is_active ? "Desativar" : "Ativar"}</Button>
                          <Button size="sm" variant="destructive" onClick={() => void manageVoice("delete", voice)} disabled={Boolean(busy)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                        </div>
                      </div>
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-medium">Histórico · {generations.filter((generation) => generation.voice_model_id === voice.model_id).length}/3 gerações</p>
                        {generations.filter((generation) => generation.voice_model_id === voice.model_id).length === 0 ? <p className="text-xs text-muted-foreground">Ainda não gerou áudios para esta voz.</p> : generations.filter((generation) => generation.voice_model_id === voice.model_id).map((generation) => (
                          <div key={generation.id} className="flex flex-col gap-2 rounded bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0"><p className="text-sm">Geração {generation.generation_number} · {new Date(generation.created_at).toLocaleString("pt-AO")}{generation.duration_seconds ? ` · ${Number(generation.duration_seconds).toFixed(1)} s` : ""}</p><p className="truncate text-xs text-muted-foreground">{generation.status === "generating" ? "A gerar..." : generation.text_input}</p></div>
                            {generation.status === "ready" && <Button size="sm" variant="outline" onClick={() => void playGeneration(generation)}><Play className="mr-2 h-4 w-4" />{playingGenerationId === generation.id ? "Reproduzir novamente" : "Ouvir"}</Button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              </TabsContent>
              <TabsContent value="library" className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><AudioLines className="h-5 w-5" />Biblioteca de vozes</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs value={libraryMode} onValueChange={(value) => {
                      const mode = value as "recommended" | "explore";
                      setLibraryMode(mode);
                      setShowFavoritesOnly(false);
                      if (mode === "recommended") void loadCuratedVoices();
                    }}>
                      <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-2">
                        <TabsTrigger value="recommended" className="whitespace-normal">Recomendadas Muwoyo</TabsTrigger>
                        <TabsTrigger value="explore" className="whitespace-normal">Explorar Todas as Vozes</TabsTrigger>
                      </TabsList>
                      <TabsContent value="explore" className="space-y-4 pt-4">
                        <form className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={(event) => { event.preventDefault(); void loadFishVoices(librarySearch, 1, false, libraryLanguage, librarySort); }}>
                          <div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Pesquisar voz por nome ou estilo" className="min-w-0 pl-9" /></div>
                          <select value={libraryLanguage} onChange={(event) => setLibraryLanguage(event.target.value)} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" aria-label="Filtrar por idioma"><option value="pt">Português</option><option value="all">Todos os idiomas</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option></select>
                          <select value={librarySort} onChange={(event) => setLibrarySort(event.target.value)} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" aria-label="Ordenar vozes"><option value="task_count">Mais populares</option><option value="like_count">Mais curtidas</option></select>
                          <Button type="submit" disabled={libraryLoading} className="w-full sm:w-auto">{libraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Pesquisar</Button>
                        </form>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input value={manualReferenceId} onChange={(event) => setManualReferenceId(event.target.value)} placeholder="Importar por ID de voz" aria-label="ID público da voz" className="min-w-0" />
                          <Button variant="outline" className="w-full sm:w-auto" onClick={() => void lookupVoice()} disabled={Boolean(busy) || !manualReferenceId.trim()}>{busy === "voice-lookup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Importar por ID</Button>
                        </div>
                      </TabsContent>
                    </Tabs>
                    <div className="flex flex-col gap-2 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select value={libraryGender} onChange={(event) => setLibraryGender(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filtrar por género"><option value="all">Todos os géneros</option><option value="feminina">Feminino</option><option value="masculina">Masculino</option></select>
                        {libraryMode === "explore" && <select value={libraryCountry} onChange={(event) => setLibraryCountry(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Filtrar por país ou região"><option value="all">Todos os países</option>{countryOptions.map((country) => <option key={country} value={country}>{formatVoiceCountry(country)}</option>)}</select>}
                        <Button type="button" size="sm" variant={showFavoritesOnly ? "secondary" : "outline"} className="w-full sm:w-auto" onClick={() => void showFavoriteVoices()} disabled={busy === "favorite-list"}>{busy === "favorite-list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${showFavoritesOnly ? "fill-current" : ""}`} />}{showFavoritesOnly ? "Ver todas as vozes" : `Favoritas (${favoriteVoiceIds.length})`}</Button>
                      </div>
                      <p className="text-center text-xs text-muted-foreground sm:text-right">{showFavoritesOnly ? `${favoriteVoices.length.toLocaleString("pt-AO")} voz(es) favorita(s)` : libraryMode === "explore" && libraryLoaded ? `${fishVoices.length.toLocaleString("pt-AO")}${libraryTotal !== null ? ` de ${libraryTotal.toLocaleString("pt-AO")}` : ""} vozes nesta página${libraryTotal !== null ? ` · total ${libraryTotal.toLocaleString("pt-AO")}` : ""}` : `${curatedVoices.length.toLocaleString("pt-AO")} vozes recomendadas`}</p>
                    </div>
                    {libraryMode === "explore" && libraryWindowLimited && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">A lista foi limitada pelo serviço. Foram carregadas as vozes disponíveis nesta janela de consulta{libraryTotal !== null ? ` (total informado: ${libraryTotal})` : ""}.</p>}
                    {libraryLoading && !(libraryMode === "explore" ? libraryLoaded : curatedLoaded) ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar vozes...</p> : visibleFishVoices.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <p className="font-medium">{showFavoritesOnly
                          ? favoriteVoiceIds.length === 0 ? "Ainda não adicionou vozes aos favoritos." : "As suas vozes favoritas não estão disponíveis."
                          : libraryMode === "recommended" ? "Ainda não há vozes recomendadas." : "Nenhuma voz encontrada com estes filtros."}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{showFavoritesOnly
                          ? unavailableFavoriteIds.length ? "Algumas vozes guardadas já não estão públicas ou foram removidas. Explore a biblioteca para descobrir outras." : "Marque uma voz com o ícone de coração para a encontrar aqui."
                          : libraryMode === "recommended" ? "A equipa Muwoyo está a selecionar vozes para esta lista. As recomendações aparecerão aqui quando forem ativadas no painel." : "Experimente alterar a pesquisa ou os filtros."}</p>
                        {libraryMode === "recommended" && !showFavoritesOnly && <Button type="button" variant="outline" className="mt-4" onClick={() => void loadCuratedVoices()} disabled={libraryLoading}>{libraryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Atualizar recomendações</Button>}
                      </div>
                    ) : (
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleFishVoices.map((voice) => {
                          const selected = voiceSettings.voice_source === "library" && voiceSettings.active_voice_reference_id === voice.reference_id;
                          return (
                            <div key={voice.reference_id} className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 sm:min-h-44 sm:p-4 ${selected ? "border-primary ring-1 ring-primary/40" : ""}`}>
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-words font-medium">{voice.name}{selected && <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" />Ativa no Atendente</span>}</p>
                                  <div className="mt-1 flex flex-wrap gap-1">{(voice.languages.length ? voice.languages : ["Idioma não indicado"]).map((language) => <span key={language} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{translateVoiceLanguages([language]).join(", ") || language}</span>)}{voice.gender && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{voice.gender}</span>}{voice.country && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{formatVoiceCountry(voice.country)}</span>}</div>
                                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{voice.description_pt}</p>
                                  {(voice.task_count || voice.like_count || voice.author) && <p className="mt-2 text-xs text-muted-foreground">{voice.task_count ? `${voice.task_count.toLocaleString("pt-AO")} utilizações` : ""}{voice.task_count && voice.like_count ? " · " : ""}{voice.like_count ? `${voice.like_count.toLocaleString("pt-AO")} gostos` : ""}{(voice.task_count || voice.like_count) && voice.author ? " · " : ""}{voice.author ? `por ${voice.author}` : ""}</p>}
                                </div>
                                <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => void toggleFavorite(voice)} disabled={busy === `favorite:${voice.reference_id}`} aria-label={favoriteVoiceIds.includes(voice.reference_id) ? `Remover ${voice.name} dos favoritos` : `Adicionar ${voice.name} aos favoritos`} aria-pressed={favoriteVoiceIds.includes(voice.reference_id)} title={favoriteVoiceIds.includes(voice.reference_id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}><Heart className={`h-5 w-5 ${favoriteVoiceIds.includes(voice.reference_id) ? "fill-current text-rose-500" : ""}`} /></Button>
                              </div>
                              <div className="mt-auto grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => playingGenerationId === `preview:${voice.reference_id}` ? stopPlayback() : void playVoicePreview(voice)} disabled={busy === `preview:${voice.reference_id}`}>{busy === `preview:${voice.reference_id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : playingGenerationId === `preview:${voice.reference_id}` ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{playingGenerationId === `preview:${voice.reference_id}` ? "Parar prévia" : "Ouvir prévia"}</Button>
                                <Button size="sm" className="w-full whitespace-normal sm:w-auto" onClick={() => void selectVoice(voice.reference_id, "library", voice.name)} disabled={Boolean(busy) || selected}>{selected ? "Selecionada" : "Selecionar Voz"}</Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {libraryMode === "explore" && libraryLoaded && (libraryPage > 1 || libraryHasMore) && <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void loadFishVoices(librarySearch, libraryPage - 1, false, libraryLanguage, librarySort)} disabled={libraryLoading || libraryPage <= 1}>Anterior</Button>
                      <span className="text-sm text-muted-foreground">Página {libraryPage}{libraryTotal !== null ? ` de ${Math.max(1, Math.ceil(libraryTotal / 20))}` : ""}</span>
                      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void loadFishVoices(librarySearch, libraryPage + 1, false, libraryLanguage, librarySort)} disabled={libraryLoading || !libraryHasMore}>{libraryLoading ? <><Loader2 className="h-4 w-4 animate-spin" />A carregar...</> : "Próxima"}</Button>
                    </div>}
                  </CardContent>
                </Card>
              </TabsContent>
              <Card>
                <Collapsible open={tuningOpen} onOpenChange={setTuningOpen}>
                  <CardHeader className="pb-3">
                    <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                      <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Ajustes da Voz</CardTitle>
                      <span className="text-sm text-muted-foreground">{tuningOpen ? "Recolher" : "Expandir"}</span>
                    </CollapsibleTrigger>
                    <p className="text-sm text-muted-foreground">{voiceSettings.voice_name ? `Voz atual: ${voiceSettings.voice_name}` : "Selecione uma voz para o atendente."}</p>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-5">
                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="space-y-2"><div className="flex justify-between text-sm"><Label>Velocidade da fala</Label><span>{voiceSettings.voice_tuning.prosody.speed.toFixed(2)}x</span></div><Slider min={0.5} max={2} step={0.05} value={[voiceSettings.voice_tuning.prosody.speed]} onValueChange={([speed]) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, prosody: { ...current.voice_tuning.prosody, speed } } }))} /><p className="text-xs text-muted-foreground">Mais lenta (0.5x) ← Normal (1.0x) → Mais rápida (2.0x)</p></div>
                        <div className="space-y-2"><div className="flex justify-between text-sm"><Label>Volume do áudio</Label><span>{voiceSettings.voice_tuning.prosody.volume > 0 ? "+" : ""}{voiceSettings.voice_tuning.prosody.volume} dB</span></div><Slider min={-20} max={20} step={1} value={[voiceSettings.voice_tuning.prosody.volume]} onValueChange={([volume]) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, prosody: { ...current.voice_tuning.prosody, volume } } }))} /><p className="text-xs text-muted-foreground">Mais baixo (-20 dB) ← Padrão (0 dB) → Mais alto (+20 dB)</p></div>
                        <div className="space-y-2"><div className="flex justify-between text-sm"><Label>Expressividade / entonação</Label><span>{voiceSettings.voice_tuning.temperature.toFixed(2)}</span></div><Slider min={0.1} max={1} step={0.05} value={[voiceSettings.voice_tuning.temperature]} onValueChange={([temperature]) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, temperature } }))} /><p className="text-xs text-muted-foreground">Valores menores deixam a voz estável e séria; maiores deixam-na mais expressiva e emotiva.</p></div>
                        <div className="space-y-2"><div className="flex justify-between text-sm"><Label>Estabilidade / fidelidade</Label><span>{voiceSettings.voice_tuning.top_p.toFixed(2)}</span></div><Slider min={0.1} max={1} step={0.05} value={[voiceSettings.voice_tuning.top_p]} onValueChange={([top_p]) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, top_p } }))} /><p className="text-xs text-muted-foreground">Controla a consistência do timbre e da pronúncia.</p></div>
                        <div className="space-y-2"><div className="flex justify-between text-sm"><Label>Tamanho do bloco / fluidez</Label><span>{voiceSettings.voice_tuning.chunk_length}</span></div><Slider min={100} max={300} step={1} value={[voiceSettings.voice_tuning.chunk_length]} onValueChange={([chunk_length]) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, chunk_length } }))} /><p className="text-xs text-muted-foreground">Ajusta a fluidez das pausas em frases longas.</p></div>
                        <div className="flex items-center justify-between gap-4 rounded-md border p-3"><div><Label htmlFor="voice-normalize">Normalização de texto</Label><p className="text-xs text-muted-foreground">Converte números, datas e valores em leitura natural.</p></div><Switch id="voice-normalize" checked={voiceSettings.voice_tuning.normalize} onCheckedChange={(normalize) => setVoiceSettings((current) => ({ ...current, voice_tuning: { ...current.voice_tuning, normalize } }))} /></div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={() => { setVoiceSettings((current) => ({ ...current, voice_tuning: DEFAULT_VOICE_TUNING })); void saveVoiceTuning(DEFAULT_VOICE_TUNING); }} disabled={busy === "voice-tuning"}>Restaurar Padrão</Button>
                        <Button onClick={() => void saveVoiceTuning()} disabled={busy === "voice-tuning"}>{busy === "voice-tuning" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...</> : "Guardar ajustes"}</Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
              {playingUrl && <div className="mt-4 flex items-center gap-3 rounded-md bg-muted p-3"><Volume2 className="h-4 w-4 shrink-0" /><audio ref={audioRef} controls src={playingUrl} className="w-full" /><Button size="icon" variant="ghost" onClick={stopPlayback} aria-label="Parar áudio"><Square className="h-4 w-4" /></Button></div>}
            </Tabs>
          )}

          <Card>
            <CardHeader><CardTitle>Histórico de Top-ups</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {requests.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não enviou comprovativos de Top-up.</p> : requests.map((request) => (
                <div key={request.id} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-medium">{Number(request.minutes).toLocaleString("pt-AO")} min · {Number(request.amount_kz).toLocaleString("pt-AO")} Kz</p><p className="text-xs text-muted-foreground">{request.payment_id} · {new Date(request.submitted_at).toLocaleString("pt-AO")}</p>{request.rejection_reason && <p className="text-xs text-destructive">Motivo: {request.rejection_reason}</p>}</div>
                  <span className="text-sm capitalize">{request.status === "pending" ? "Em validação" : request.status === "approved" ? "Aprovado" : "Recusado"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Dialog open={topupOpen} onOpenChange={(open) => { if (busy !== "topup") setTopupOpen(open); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader><DialogTitle>Comprar minutos de áudio</DialogTitle></DialogHeader>
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label htmlFor="topup-minutes">Quantidade de minutos (mínimo 20)</Label>
                  <div className="flex items-center gap-3">
                    <input type="range" min="20" max="500" step="10" value={Math.min(500, Math.max(20, minutes))} onChange={(event) => setMinutes(Number(event.target.value))} className="w-full accent-primary" aria-label="Selecionar minutos de Top-up" />
                    <Input id="topup-minutes" type="number" min="20" step="1" value={minutes} onChange={(event) => setMinutes(Math.max(20, Number(event.target.value) || 20))} className="w-28" />
                  </div>
                  <div className="flex flex-wrap gap-2">{[20, 50, 100, 250].map((value) => <Button key={value} type="button" size="sm" variant={minutes === value ? "default" : "outline"} onClick={() => setMinutes(value)}>{value} min</Button>)}</div>
                  <p className="text-xl font-bold">{(minutes * 50).toLocaleString("pt-AO")} Kz <span className="text-sm font-normal text-muted-foreground">· {minutes} min × 50 Kz</span></p>
                </div>
                {methods.length === 0 ? <p className="text-sm text-destructive">Os dados bancários ainda não foram configurados. Contacte o suporte.</p> : (
                  <>
                    <div className="space-y-2"><Label htmlFor="audio-payment-method">Método de pagamento</Label><select id="audio-payment-method" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>{methods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}</select></div>
                    {methods.map((method) => (
                      <div key={method.id} className="space-y-2 rounded-md border p-4">
                        <p className="font-semibold">{method.label}</p>
                        {[
                          ["IBAN", method.iban], ["Titular", method.account_holder_name], ["Banco", method.bank_name],
                          ["Entidade", method.entity_name], ["Número de entidade", method.entity_number], ["Telefone", method.phone_number],
                        ].filter(([, value]) => value).map(([label, value]) => <button key={label} type="button" className="flex w-full justify-between gap-2 text-left text-sm" onClick={() => void copy(value)}><span><span className="text-muted-foreground">{label}: </span>{value}</span><span className="text-primary">Copiar</span></button>)}
                        {method.instructions && <p className="text-sm text-muted-foreground">{method.instructions}</p>}
                      </div>
                    ))}
                    <div className="space-y-2"><Label htmlFor="audio-topup-proof">Comprovativo (PDF ou imagem, máx. 10 MB)</Label><Input id="audio-topup-proof" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setProof(event.currentTarget.files?.[0] || null)} />{proof && <p className="text-xs text-muted-foreground">{proof.name}</p>}</div>
                  </>
                )}
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0" />Os minutos serão creditados após confirmação do pagamento pelo administrador e não expiram.</p>
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setTopupOpen(false)} disabled={busy === "topup"}>Cancelar</Button><Button onClick={() => void submitTopup()} disabled={busy === "topup" || methods.length === 0 || !proof || minutes < 20}>{busy === "topup" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...</> : <><Upload className="mr-2 h-4 w-4" />Enviar comprovativo</>}</Button></div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </DashboardShell>
  );
}
