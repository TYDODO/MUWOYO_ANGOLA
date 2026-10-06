import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import AudioMessagePlayer from "@/components/inbox/AudioMessagePlayer";
import { normalizeWhatsAppPhone } from "@/lib/message-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Paperclip,
  Image as ImageIcon,
  Send,
  Check,
  CheckCheck,
  ArrowDown,
  Mic,
  FileText,
  MoreVertical,
  Smile,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import DateTimeSelect from "@/components/DateTimeSelect";

const db = supabase as any;
type Conversation = {
  id: string;
  contact_id: string;
  status: string;
  assigned_to: string | null;
  instance_name?: string | null;
  is_group?: boolean;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview?: string | null;
  last_message_direction?: string | null;
  last_message_kind?: string | null;
  response_mode?: "ai" | "human";
  contact?: {
    name: string | null;
    custom_name?: string | null;
    phone_number: string;
    profile_picture_url?: string | null;
    is_group?: boolean;
  };
};
type InboxAttendant = { user_id: string; name: string | null; email: string };
type InboxSyncResponse = { cached?: boolean; historyPending?: number };
type Message = {
  id: string;
  direction: string;
  message_text: string | null;
  ai_responded: boolean;
  created_at: string;
  kind?: string;
  media_url?: string | null;
  media_metadata?: { latitude?: number; longitude?: number; address?: string; name?: string } | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  delivery_status?: string | null;
  read_at?: string | null;
  external_id?: string | null;
  is_voice_note?: boolean;
  is_historical?: boolean;
};

function getContactInitials(name?: string | null, phone?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (phone || "?").slice(-2).toUpperCase();
}

export default function Inbox() {
  const { user } = useAuth();
  const { membership, ownerUserId, isOwner, hasPermission } = useBusinessMembership();
  const { entitlements, planName, loading } = usePlanEntitlements();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
    const [attendants, setAttendants] = useState<InboxAttendant[]>([]);
  const [instances, setInstances] = useState<{ instance_name: string; phone: string | null; connection_state: string | null }[]>([]);
  const [activeInstance, setActiveInstance] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [atLatest, setAtLatest] = useState(true);
  const [typing, setTyping] = useState(false);
  const [contactState, setContactState] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showCustomer, setShowCustomer] = useState(true);
  const [quickAction, setQuickAction] = useState<
    "order" | "appointment" | null
  >(null);
  const [quickForm, setQuickForm] = useState({
    service: "",
    item: "",
    scheduled_at: "",
    notes: "",
    location: "",
    price: "",
    quantity: "1",
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [mediaRetryMap, setMediaRetryMap] = useState<Record<string, number>>({});
  const [mediaStateMap, setMediaStateMap] = useState<Record<string, { loading: boolean; error: boolean }>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newConversationForm, setNewConversationForm] = useState({ name: "", countryCode: "+244", phone: "" });
  const [contactNameDraft, setContactNameDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(
    null,
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageLoadSequenceRef = useRef(0);
  const selectedRef = useRef<Conversation | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const markedReadMessageIdsRef = useRef(new Set<string>());
  const scrollAfterLoadRef = useRef(false);

  const load = async () => {
    if (!user || !ownerUserId) return;
    const { data: instanceRows } = await db.from("instances").select("instance_name,phone,connection_state").eq("user_id", ownerUserId).order("created_at");
    const nextInstances = instanceRows || [];
    setInstances(nextInstances);
    const instanceName = activeInstance || nextInstances[0]?.instance_name;
    if (!instanceName) return;
    if (!activeInstance) setActiveInstance(instanceName);
    let conversationsQuery = db
      .from("inbox_conversations")
      .select("id,contact_id,status,assigned_to,unread_count,last_message_at,last_message_preview,last_message_direction,last_message_kind,response_mode,instance_name")
      .eq("user_id", ownerUserId)
      .eq("instance_name", instanceName)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (membership?.role === "attendant") conversationsQuery = conversationsQuery.eq("assigned_to", user.id);
    const [{ data: rows }, { data: contacts }] = await Promise.all([
      conversationsQuery,
      db
        .from("whatsapp_contacts")
        .select("id,name,custom_name,phone_number,profile_picture_url,is_group")
        .eq("user_id", ownerUserId)
        .eq("instance_name", instanceName),
    ]);
    const contactMap = new Map<string, {
      id: string;
      name: string | null;
      custom_name?: string | null;
      phone_number: string;
      is_group?: boolean;
      profile_picture_url?: string | null;
    }>(
      (contacts || []).map(
        (contact: {
          id: string;
          name: string | null;
          phone_number: string;
          is_group?: boolean;
        }) => [contact.id, contact],
      ),
    );
    const mappedConversations = (rows || [])
        .filter((row: Conversation) => {
          const contact = contactMap.get(row.contact_id);
          return Boolean(contact && !contact.is_group && !String(contact.phone_number || "").includes("@"));
        })
        .map((row: Conversation) => {
          const contact = contactMap.get(row.contact_id);
          return {
            ...row,
            contact: contact ? { ...contact, name: contact.custom_name || contact.name } : undefined,
          };
        });
    setConversations(mappedConversations);
    setSelected((current) => current
      ? mappedConversations.find((conversation: Conversation) => conversation.id === current.id) || current
      : current);
  };

  useEffect(() => {
    if (!isOwner || !membership?.business_id) {
      setAttendants([]);
      return;
    }
    let cancelled = false;
    void db.from("business_members")
      .select("user_id,name,email")
      .eq("business_id", membership.business_id)
      .eq("role", "attendant")
      .eq("status", "active")
      .order("name")
      .then(({ data }: { data: InboxAttendant[] | null }) => {
        if (!cancelled) setAttendants(data || []);
      });
    return () => { cancelled = true; };
  }, [isOwner, membership?.business_id]);

  const syncInbox = async (silent = false) => {
    if (!user || !ownerUserId) return;
    if (syncPromiseRef.current) return syncPromiseRef.current;

    const syncTask = (async () => {
      setSyncing(true);
      try {
        let lastSync: InboxSyncResponse | null = null;
        for (let batch = 0; batch < 4; batch += 1) {
          const { data, error } = await supabase.functions.invoke("inbox-sync", { body: { instanceName: activeInstance || undefined } });
          if (error || data?.error) {
            if (!silent) toast({
                title: "Sincronização parcial",
                description: "As conversas guardadas continuam disponíveis. A sincronização WhatsApp será repetida quando a ligação voltar.",
                variant: "destructive",
              });
            break;
          }
          lastSync = data;
          if (data?.cached || !data?.historyPending) break;
        }
        if (!silent && lastSync?.cached) {
          toast({ title: "WhatsApp indisponível", description: "A mostrar as conversas já sincronizadas. A sincronização será repetida quando o telefone voltar a estar online." });
        } else if (!silent && lastSync?.historyPending > 0) {
          toast({ title: "Conversas sincronizadas", description: `Ainda há ${lastSync.historyPending} históricos para importar. Use Sincronizar novamente para continuar.` });
        }
      } catch (error) {
        if (!silent) toast({ title: "Sincronização parcial", description: error instanceof Error ? error.message : "As conversas locais continuam disponíveis; tente sincronizar novamente quando a ligação voltar.", variant: "destructive" });
      } finally {
        await load();
        setSyncing(false);
        syncPromiseRef.current = null;
      }
    })();
    syncPromiseRef.current = syncTask;
    return syncTask;
  };

  useEffect(() => {
    void load();
    if (!user || !ownerUserId) return;
    const channel = supabase
      .channel(`inbox-${user.id}`, { config: { presence: { key: user.id } } })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_conversations",
          filter: `user_id=eq.${ownerUserId}`,
        },
        () => {
          const activeConversation = selectedRef.current;
          void load();
          if (activeConversation) void loadMessages(activeConversation);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${ownerUserId}`,
        },
        (payload) => {
          if (selectedRef.current && (payload.new as Message)?.id)
            void loadMessages(selectedRef.current);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_contacts",
          filter: `user_id=eq.${ownerUserId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_contact_presence",
          filter: `user_id=eq.${ownerUserId}`,
        },
        (payload) => {
          const presence = payload.new as {
            phone_number?: string;
            state?: string;
          };
          if (
            presence.phone_number === selectedRef.current?.contact?.phone_number
          ) {
            setContactState(presence.state || null);
            setTyping(presence.state === "typing");
          }
        },
      )
      .on("presence", { event: "sync" }, () => {
        const states = channel.presenceState();
        const entries = Object.values(states).flat() as any[];
        const remote = entries.find((entry) => entry.user_id !== user.id);
        setTyping(Boolean(remote?.typing));
        setContactState(remote?.state || null);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            typing: false,
            state: "online",
          });
          const activeConversation = selectedRef.current;
          if (activeConversation) void loadMessages(activeConversation);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, ownerUserId, membership?.role, activeInstance]);

  useEffect(() => {
    if (activeInstance) void syncInbox(true);
  }, [activeInstance, user?.id, ownerUserId]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setInterval(() => {
      const activeConversation = selectedRef.current;
      if (activeConversation?.id === selected.id) void loadMessages(activeConversation);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [selected?.id]);

  const loadMessages = async (conversation: Conversation) => {
    if (!user || !ownerUserId) return;
    const requestSequence = ++messageLoadSequenceRef.current;
    const { data, error } = await db
      .from("messages")
      .select(
        "id,direction,message_text,ai_responded,created_at,kind,media_url,media_metadata,delivery_status,read_at,external_id,is_voice_note,file_name,file_size_bytes,mime_type,is_historical",
      )
      .eq("user_id", ownerUserId)
      .eq("whatsapp_instance_id", conversation.instance_name || activeInstance)
      .eq("phone_number", conversation.contact?.phone_number || "")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: "Não foi possível carregar as mensagens", description: error.message, variant: "destructive" });
      return;
    }
    if (requestSequence !== messageLoadSequenceRef.current || selectedRef.current?.id !== conversation.id) return;
    setMessages((data || []).reverse());
  };

  const selectConversation = (conversation: Conversation) => {
    markedReadMessageIdsRef.current.clear();
    scrollAfterLoadRef.current = true;
    selectedRef.current = conversation;
    setSelected(conversation);
    setMessages([]);
    setAtLatest(true);
    void loadMessages(conversation);
  };
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!scrollAfterLoadRef.current) return;
    scrollAfterLoadRef.current = false;
    const root = messageScrollRef.current;
    if (root) root.scrollTop = root.scrollHeight;
    else messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    setAtLatest(true);
  }, [messages]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".inbox-message-scroll");
    if (!root || !selected) return;

    const observer = new IntersectionObserver((entries) => {
      const visibleMessageIds = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.65)
        .map((entry) => (entry.target as HTMLElement).dataset.messageId)
        .filter((id): id is string => Boolean(id) && !markedReadMessageIdsRef.current.has(id));
      if (!visibleMessageIds.length) return;

      visibleMessageIds.forEach((id) => markedReadMessageIdsRef.current.add(id));
      void supabase.functions.invoke("mark-conversation-read", {
        body: { messageIds: visibleMessageIds },
      }).then(({ error }) => {
        if (error) {
          visibleMessageIds.forEach((id) => markedReadMessageIdsRef.current.delete(id));
          return;
        }
        const readIds = new Set(visibleMessageIds);
        setMessages((current) => current.map((message) =>
          readIds.has(message.id)
            ? { ...message, delivery_status: "read" }
            : message,
        ));
      });
    }, { root, threshold: [0.65] });

    root.querySelectorAll<HTMLElement>("[data-message-direction='inbound'][data-message-id]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [messages, selected?.id]);

  useEffect(() => {
    setContactNameDraft(
      selected?.contact?.custom_name || selected?.contact?.name || "",
    );
  }, [selected?.id, selected?.contact?.custom_name, selected?.contact?.name]);

  useEffect(() => {
    if (!mediaFile) {
      setRecordingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setRecordingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  const toggleRecording = async () => {
    if (recording && recorderRef.current) {
      if (recordingPaused) {
        recorderRef.current.resume();
        setRecordingPaused(false);
      } else {
        recorderRef.current.pause();
        const previewBlob = new Blob(recordingChunksRef.current, { type: recorderRef.current.mimeType || "audio/webm" });
        if (previewBlob.size) setRecordingPreviewUrl(URL.createObjectURL(previewBlob));
        setRecordingPaused(true);
      }
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recordingChunksRef.current = chunks;
    discardRecordingRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (discardRecordingRef.current) {
        setRecording(false);
        setRecordingPaused(false);
        recorderRef.current = null;
        return;
      }
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });
      setMediaFile(
        new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }),
      );
      setRecording(false);
      setRecordingPaused(false);
      recorderRef.current = null;
    };
    mediaStreamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setRecordingPaused(false);
  };

  const finishRecording = () => {
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  };

  const cancelRecording = () => {
    discardRecordingRef.current = true;
    recorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setRecording(false);
    setRecordingPaused(false);
    setMediaFile(null);
  };
  const visible = useMemo(
    () =>
      conversations.filter((conversation) => {
        const term = search.toLowerCase();
        const matchesSearch =
          `${conversation.contact?.name || ""} ${conversation.contact?.phone_number || ""}`
            .toLowerCase()
            .includes(term);
        const matchesFilter =
          filter === "unread"
            ? conversation.unread_count > 0
            : filter === "mine"
              ? conversation.assigned_to === user?.id
              : filter === "unassigned"
                ? !conversation.assigned_to
                : filter === "ai"
                  ? conversation.status !== "human"
                  : filter === "human"
                    ? conversation.status === "human"
                    : filter === "resolved"
                      ? conversation.status === "closed"
                      : true;
        return matchesSearch && matchesFilter;
      }),
    [conversations, filter, search, user],
  );

  const assignConversation = async (assigneeId: string | null) => {
    if (!selected || !user || !ownerUserId) return;
    if (!isOwner && (!hasPermission("inbox.assign") || (assigneeId !== null && assigneeId !== user.id))) {
      return toast({ title: "Sem permissão para atribuir esta conversa", variant: "destructive" });
    }
    const patch = assigneeId
      ? { assigned_to: assigneeId, status: "human", response_mode: "human" }
      : { assigned_to: null };
    const { error } = await db
      .from("inbox_conversations")
      .update(patch)
      .eq("id", selected.id)
      .eq("user_id", ownerUserId)
      .eq("instance_name", selected.instance_name || activeInstance);
    if (error)
      return toast({
        title: "Não foi possível atribuir a conversa",
        description: error.message,
        variant: "destructive",
      });
    setSelected({ ...selected, assigned_to: assigneeId, ...(assigneeId ? { status: "human", response_mode: "human" as const } : {}) });
    await load();
  };

  const toggleAi = async () => {
    if (!selected || !user || !ownerUserId) return;
    const nextMode = selected.response_mode === "human" ? "ai" : "human";
    const { error } = await db
      .from("inbox_conversations")
      .update({ response_mode: nextMode })
      .eq("id", selected.id)
      .eq("user_id", ownerUserId);
    if (error)
      return toast({
        title: "Não foi possível alterar o atendimento",
        description: error.message,
        variant: "destructive",
      });
    setSelected({
      ...selected,
      response_mode: nextMode,
    });
    await load();
  };

  const resolveConversation = async () => {
    if (!selected || !user || !ownerUserId) return;
    await db
      .from("inbox_conversations")
      .update({ status: "closed" })
      .eq("id", selected.id)
      .eq("user_id", ownerUserId);
    setSelected({ ...selected, status: "closed" });
    await load();
  };

  const createQuickAction = async () => {
    if (!selected?.contact || !user || !quickAction) return;
    if (quickAction === "appointment" && !quickForm.scheduled_at) return;
    const result =
      quickAction === "appointment"
        ? await db
            .from("appointments")
            .insert({
              user_id: ownerUserId,
              customer_name: selected.contact.name,
              customer_phone: selected.contact.phone_number,
              service: quickForm.service || "Atendimento",
              description: quickForm.notes || null,
              notes: quickForm.notes || null,
              location: quickForm.location || null,
              price: quickForm.price ? Number(quickForm.price) : null,
              scheduled_at: new Date(quickForm.scheduled_at).toISOString(),
              status: "confirmed",
            })
        : await db
            .from("store_orders")
            .insert({
              user_id: ownerUserId,
              customer_name: selected.contact.name,
              customer_phone: selected.contact.phone_number,
              customer_location: quickForm.location || null,
              items: [
                { name: quickForm.item || "Pedido criado no Inbox", qty: Math.max(1, Number(quickForm.quantity) || 1), unit_price: Number(quickForm.price) || 0 },
              ],
              total: (Number(quickForm.price) || 0) * Math.max(1, Number(quickForm.quantity) || 1),
              delivery_address: quickForm.location || null,
              notes: quickForm.notes || null,
              status: "new",
            });
    if (result.error)
      return toast({
        title: "Não foi possível criar",
        description: result.error.message,
        variant: "destructive",
      });
    setQuickAction(null);
    setQuickForm({ service: "", item: "", scheduled_at: "", notes: "", location: "", price: "", quantity: "1" });
    toast({
      title:
        quickAction === "appointment" ? "Agendamento criado" : "Pedido criado",
    });
  };

  const publishTyping = async (value: string) => {
    setText(value);
    const channel = supabase
      .getChannels()
      .find((item) => item.topic === `realtime:inbox-${user?.id}`);
    if (channel && user)
      await channel.track({
        user_id: user.id,
        typing: Boolean(value.trim()),
        state: value.trim() ? "typing" : "online",
      });
  };

  const send = async () => {
    if (!selected || !user || (!text.trim() && !mediaFile)) return;
    setSending(true);
    try {
      const { data: instance, error: instanceError } = await db
        .from("instances")
        .select("instance_name")
        .eq("user_id", ownerUserId || user.id)
        .eq("instance_name", selected.instance_name || activeInstance)
        .maybeSingle();
      if (instanceError) throw instanceError;
      if (!instance?.instance_name) {
        toast({
          title: "WhatsApp não conectado",
          description: "Conecte o WhatsApp antes de enviar mensagens.",
          variant: "destructive",
        });
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        toast({
          title: "Sessão expirada",
          description: "Faça login novamente para enviar mensagens.",
          variant: "destructive",
        });
        return;
      }

      let mediaUrl = "";
      if (mediaFile) {
        const path = `${user.id}/${Date.now()}-${mediaFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const upload = await supabase.storage
          .from("store-assets")
          .upload(path, mediaFile, {
            upsert: false,
            contentType: mediaFile.type,
          });
        if (upload.error) {
          toast({
            title: "Não foi possível carregar o ficheiro",
            description: upload.error.message,
            variant: "destructive",
          });
          return;
        }
        mediaUrl = supabase.storage.from("store-assets").getPublicUrl(path)
          .data.publicUrl;
      }

      const kind = mediaFile
        ? mediaFile.type.startsWith("image/")
          ? "image"
          : mediaFile.type.startsWith("video/")
            ? "video"
            : mediaFile.type.startsWith("audio/")
              ? "audio"
              : "document"
        : "text";
      const { data: sendResult, error } = await supabase.functions.invoke("inbox-send", {
        body: {
          instanceName: instance.instance_name,
          phoneNumber: selected.contact?.phone_number,
          messageText: text.trim(),
          caption: mediaCaption || text.trim(),
          kind,
          mediaUrl,
          fileName: mediaFile?.name,
          mimetype: mediaFile?.type,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const responseError = error?.context instanceof Response
        ? await error.context.clone().json().catch(() => null)
        : null;
      if (error || sendResult?.error) {
        toast({
          title: "Não foi possível enviar",
          description: responseError?.details?.message || responseError?.details?.error || responseError?.details || responseError?.error || sendResult?.details?.message || sendResult?.details?.error || sendResult?.error || error?.message || "A integração WhatsApp não confirmou o envio.",
          variant: "destructive",
        });
        return;
      }
      if (sendResult?.queued) {
        toast({ title: "Mensagem guardada para envio", description: "Será enviada automaticamente quando o WhatsApp voltar a estar online." });
      }
      setText("");
      setMediaCaption("");
      setMediaFile(null);
      await loadMessages(selected);
    } catch (error) {
      toast({
        title: "Falha ao enviar mensagem",
        description: error instanceof Error ? error.message : "Não foi possível contactar o serviço de mensagens.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const sendReaction = async (message: Message, reaction: string) => {
    if (!selected || !user || !ownerUserId || !message.external_id) return;
    const { data: instance } = await db.from("instances").select("instance_name").eq("user_id", ownerUserId).eq("instance_name", selected.instance_name || activeInstance).maybeSingle();
    if (!instance?.instance_name) return;
    const { error } = await supabase.functions.invoke("inbox-send", { body: { instanceName: instance.instance_name, phoneNumber: selected.contact?.phone_number, kind: "reaction", reaction, messageKey: { id: message.external_id, remoteJid: `${selected.contact?.phone_number}@s.whatsapp.net`, fromMe: message.direction === "outbound" } } });
    if (error) {
      toast({ title: "Não foi possível reagir", description: error.message, variant: "destructive" });
      return;
    }
    setReactionTargetId(null);
    toast({ title: "Reação enviada", description: `Você reagiu com ${reaction}` });
  };

  const openNewConversation = async () => {
    if (!ownerUserId || !activeInstance) {
      toast({ title: "WhatsApp não conectado", description: "Conecte uma instância antes de iniciar uma conversa.", variant: "destructive" });
      return;
    }

    try {
      const rawNumber = newConversationForm.phone.trim();
      const normalized = normalizeWhatsAppPhone(rawNumber, newConversationForm.countryCode.replace(/\D/g, "") || "244");
      if (!normalized || normalized.length < 9) {
        toast({ title: "Número inválido", description: "Introduza um número válido para iniciar a conversa.", variant: "destructive" });
        return;
      }

      const { data: existingContact } = await db
        .from("whatsapp_contacts")
        .select("id,name,custom_name,phone_number")
        .eq("user_id", ownerUserId)
        .eq("instance_name", activeInstance)
        .eq("phone_number", normalized)
        .maybeSingle();

      const contactRecord = existingContact || await (async () => {
        const { data, error } = await db
          .from("whatsapp_contacts")
          .insert({
            user_id: ownerUserId,
            instance_name: activeInstance,
            phone_number: normalized,
            name: newConversationForm.name.trim() || null,
            custom_name: newConversationForm.name.trim() || null,
            remote_jid: `${normalized}@s.whatsapp.net`,
            is_group: false,
            last_message_at: new Date().toISOString(),
          })
          .select("id,name,custom_name,phone_number")
          .single();

        if (error) {
          toast({ title: "Não foi possível criar a conversa", description: error.message, variant: "destructive" });
          throw error;
        }
        return data;
      })();

      const { data: existingConversation } = await db
        .from("inbox_conversations")
        .select("id,contact_id,instance_name,unread_count,last_message_at,status,assigned_to")
        .eq("user_id", ownerUserId)
        .eq("instance_name", activeInstance)
        .eq("contact_id", contactRecord.id)
        .maybeSingle();

      const conversation = existingConversation || await (async () => {
        const { data, error } = await db
          .from("inbox_conversations")
          .insert({
            user_id: ownerUserId,
            instance_name: activeInstance,
            contact_id: contactRecord.id,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
            status: "new",
            response_mode: "ai",
          })
          .select("id,contact_id,instance_name,unread_count,last_message_at,status,assigned_to")
          .single();

        if (error) {
          toast({ title: "Não foi possível criar a conversa", description: error.message, variant: "destructive" });
          throw error;
        }
        return data;
      })();

      setSelected({
        id: conversation.id,
        contact_id: conversation.contact_id,
        status: conversation.status || "new",
        assigned_to: conversation.assigned_to,
        instance_name: conversation.instance_name || activeInstance,
        unread_count: conversation.unread_count || 0,
        last_message_at: conversation.last_message_at,
        response_mode: "ai",
        contact: {
          name: contactRecord.custom_name || contactRecord.name,
          phone_number: contactRecord.phone_number,
          custom_name: contactRecord.custom_name,
        },
      });
      setNewConversationOpen(false);
      setNewConversationForm({ name: "", countryCode: "+244", phone: "" });
      await load();
      toast({ title: "Conversa iniciada", description: `Contato ${contactRecord.phone_number} adicionado.` });
    } catch (error) {
      console.error("openNewConversation failed", error);
    }
  };

  const saveContactName = async () => {
    if (!selected?.contact || !ownerUserId) return;
    const nextName = contactNameDraft.trim();
    const { error } = await db
      .from("whatsapp_contacts")
      .update({ custom_name: nextName || null, name: nextName || selected.contact.name })
      .eq("id", selected.contact_id)
      .eq("user_id", ownerUserId);

    if (error) {
      toast({ title: "Não foi possível guardar o nome", description: error.message, variant: "destructive" });
      return;
    }

    await load();
    setSelected((current) =>
      current && current.contact
        ? {
            ...current,
            contact: {
              ...current.contact,
              custom_name: nextName || null,
              name: nextName || current.contact.name,
            },
          }
        : current,
    );
    setContactNameDraft(nextName || selected.contact.name || "");
    setProfileOpen(false);
    toast({ title: "Nome do contacto actualizado" });
  };

  const conversationAction = async (action: "archive" | "block" | "delete") => {
    if (!selected || !activeInstance) return;
    const { error } = await supabase.functions.invoke("inbox-actions", { body: { action, instanceName: activeInstance, phoneNumber: selected.contact?.phone_number } });
    if (error) return toast({ title: "Ação não concluída", description: error.message, variant: "destructive" });
    if (action === "delete") { setSelected(null); selectedRef.current = null; }
    await load();
  };

  const reactionOptions = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "✨"];
  const getMessagePreviewText = (message: Message) => {
    const text = message.message_text?.trim();
    if (text) return text;
    if (message.kind === "image") return "Imagem";
    if (message.kind === "video") return "Vídeo";
    if (message.kind === "audio") return "Áudio";
    if (message.kind === "document") return "Documento";
    if (message.kind === "sticker") return "Sticker";
    if (message.kind === "location") return "Localização";
    if (message.kind === "contact") return "Contacto";
    return "Mensagem";
  };
  const unreadInboundMessages = messages.filter((message) =>
    message.direction === "inbound"
    && !message.is_historical
    && message.delivery_status !== "read"
    && !message.read_at,
  );
  const firstUnreadMessageIndex = unreadInboundMessages.length
    ? messages.findIndex((message) => message.id === unreadInboundMessages[0].id)
    : -1;
  const jumpToLatestMessage = () => {
    const root = messageScrollRef.current;
    if (!root) return;
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  };
  if (loading)
    return (
      <DashboardShell title="Inbox" description="A carregar acesso...">
        A carregar...
      </DashboardShell>
    );
  if (!entitlements.inbox)
    return (
      <DashboardShell
        title="Inbox"
        description="Centro de conversas do negócio."
      >
        <Card>
          <CardContent className="p-6">
            A Inbox não está disponível no plano atual: {planName}.
          </CardContent>
        </Card>
      </DashboardShell>
    );

  return (
    <DashboardShell
      wide
      title={entitlements.sharedInbox ? "Shared Inbox" : "Inbox"}
      description="Converse com clientes e acompanhe o contexto do CRM."
    >
      <div
        data-inbox
        data-has-selection={selected ? "true" : "false"}
        className="grid h-[calc(100vh-10.5rem)] min-h-[560px] gap-3 overflow-hidden lg:grid-cols-[minmax(230px,30%)_minmax(0,70%)]"
      >
        <Card className="inbox-conversation-list flex min-h-0 min-w-0 flex-col overflow-hidden border-0 shadow-none">
          <CardHeader className="shrink-0 px-2 py-3">
            <div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">Conversas</CardTitle><Button size="sm" className="h-7 px-2 text-[11px]" disabled={syncing} onClick={() => void syncInbox()}>{syncing ? "A sincronizar..." : "Sincronizar"}</Button></div>
            <Button size="sm" className="mt-2 h-8 w-full" onClick={() => setNewConversationOpen(true)}>+ Nova conversa</Button>
            {instances.length > 1 && <select className="h-8 rounded-md border bg-background px-2 text-xs" value={activeInstance} onChange={(event) => { setActiveInstance(event.target.value); setSelected(null); setMessages([]); }}>{instances.map((instance) => <option key={instance.instance_name} value={instance.instance_name}>{instance.phone || instance.instance_name}</option>)}</select>}
            <Input
              className="h-8 text-xs"
              placeholder="Pesquisar nome ou número"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="inbox-filters flex gap-1 overflow-x-auto pb-1">
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
              >
                Todas
              </Button>
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "unread" ? "default" : "outline"}
                onClick={() => setFilter("unread")}
              >
                Não lidas
              </Button>
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "mine" ? "default" : "outline"}
                onClick={() => setFilter("mine")}
              >
                Minhas
              </Button>
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "unassigned" ? "default" : "outline"}
                onClick={() => setFilter("unassigned")}
              >
                Sem dono
              </Button>
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "ai" ? "default" : "outline"}
                onClick={() => setFilter("ai")}
              >
                IA
              </Button>
              <Button
                className="h-7 shrink-0 px-2 text-[11px]"
                size="sm"
                variant={filter === "human" ? "default" : "outline"}
                onClick={() => setFilter("human")}
              >
                Humano
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {visible.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation)}
                className={`inbox-conversation-row w-full p-2 text-left ${selected?.id === conversation.id ? "is-selected" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d7b98e] text-xs font-semibold text-[#4a3d31]">
                    {conversation.contact?.profile_picture_url ? (
                      <img
                        src={conversation.contact.profile_picture_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getContactInitials(conversation.contact?.name, conversation.contact?.phone_number)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {conversation.contact?.name ||
                          conversation.contact?.phone_number}
                      </span>
                      {conversation.unread_count > 0 && (
                        <Badge className="h-5 min-w-5 px-1 text-[10px]">
                          {conversation.unread_count}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {conversation.last_message_direction === "outbound" ? "Empresa: " : ""}
                        {conversation.last_message_preview || conversation.contact?.phone_number}
                      </span>
                      {conversation.last_message_at && <time className="shrink-0">{new Date(conversation.last_message_at).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" })}</time>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={conversation.status === "closed" ? "text-slate-500" : "text-emerald-700"}>● {conversation.status === "closed" ? "Fechada" : conversation.response_mode === "human" || conversation.status === "human" ? "Humano" : "IA"}</span>
                      <span>·</span>
                      <span>{conversation.assigned_to ? attendants.find((member) => member.user_id === conversation.assigned_to)?.name || (conversation.assigned_to === user?.id ? "Atribuída a mim" : "Atribuída") : "Sem responsável"}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {visible.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada.
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="inbox-chat-panel flex min-h-0 min-w-0 flex-col overflow-hidden border-[#d8d0c4] bg-[#efeae2]">
          <CardHeader className="shrink-0 border-b border-[#d8d0c4] bg-[#f7f3ed] py-2">
            <div className="flex items-center gap-2">
              <Button
                className="lg:hidden"
                variant="ghost"
                size="icon"
                onClick={() => setSelected(null)}
                aria-label="Voltar para conversas"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                disabled={!selected}
                onClick={() => selected && setProfileOpen(true)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d7b98e] text-sm font-semibold text-[#4a3d31]">
                  {selected?.contact?.profile_picture_url ? (
                    <img
                      src={selected.contact.profile_picture_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getContactInitials(selected?.contact?.name, selected?.contact?.phone_number)
                  )}
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm">
                    {selected?.contact?.name ||
                      selected?.contact?.phone_number ||
                      "Selecione uma conversa"}
                  </CardTitle>
                  {selected && (
                    <div className="truncate text-[11px] text-[#756b62]">
                      {typing
                        ? "A escrever..."
                        : contactState === "recording"
                          ? "A gravar áudio..."
                          : contactState === "online"
                            ? "online"
                            : selected.response_mode === "human" || selected.status === "human"
                              ? "Atendimento humano"
                              : "Muwoyo IA"}{" "}
                      · {selected.contact?.phone_number}
                    </div>
                  )}
                </div>
              </button>
              {selected && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs" aria-label="Atribuir conversa">
                      <UserRound className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Atribuir</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void assignConversation(user?.id || null)}>Atribuir a mim</DropdownMenuItem>
                    {isOwner && attendants.map((attendant) => (
                      <DropdownMenuItem key={attendant.user_id} onClick={() => void assignConversation(attendant.user_id)}>
                        {attendant.name || attendant.email}
                      </DropdownMenuItem>
                    ))}
                    {selected.assigned_to && <DropdownMenuItem onClick={() => void assignConversation(null)}>Remover atribuição</DropdownMenuItem>}
                    {isOwner && attendants.length === 0 && <DropdownMenuItem onClick={() => { window.location.href = "/equipa"; }}>Cadastrar atendente</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {selected && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Ações da conversa"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setProfileOpen(true)}>Abrir perfil</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => ownerUserId && void db.from("inbox_conversations").update({ unread_count: 1 }).eq("id", selected.id).eq("user_id", ownerUserId).then(() => void load())}>Marcar como não lida</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void toggleAi()}>{selected.response_mode === "human" || selected.status === "human" ? "Devolver para IA" : "Minha resposta"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void resolveConversation()}>Resolver conversa</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void conversationAction("archive")}>Arquivar conversa</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void conversationAction("block")}>Bloquear contacto</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void conversationAction("delete")}>Eliminar conversa</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardHeader>
          <CardContent className="relative flex min-h-0 flex-1 flex-col gap-2 bg-[radial-gradient(#d8d0c4_0.7px,transparent_0.7px)] [background-size:16px_16px]">
            <div
              ref={messageScrollRef}
              className="inbox-message-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-1 py-2"
              onScroll={(event) => {
                const root = event.currentTarget;
                setAtLatest(root.scrollHeight - root.scrollTop - root.clientHeight < 80);
              }}
            >
              {selected ? (
                <>
                  {messages.map((message, messageIndex) => {
                    const mediaStatus = mediaStateMap[message.id] ?? { loading: false, error: false };
                    const mediaRetryKey = mediaRetryMap[message.id] ?? 0;

                    return (
                      <Fragment key={message.id}>
                      {messageIndex === firstUnreadMessageIndex && (
                        <div className="sticky top-1 z-10 mx-auto my-2 w-fit rounded-full border border-emerald-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-emerald-800 shadow-sm">
                          Mensagens não lidas
                        </div>
                      )}
                      <div
                        data-message-id={message.id}
                        data-message-direction={message.direction}
                        className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          onContextMenu={(event) => {
                            if (!message.external_id) return;
                            event.preventDefault();
                            setReactionTargetId((current) => current === message.id ? null : message.id);
                          }}
                          className={`group relative max-w-[78%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${message.direction === "outbound" ? "rounded-br-sm bg-[#d9fdd3] text-[#26342a]" : "rounded-bl-sm bg-white text-[#2e2b28]"} ${reactionTargetId === message.id ? "ring-2 ring-[#3c9b65]" : ""}`}
                        >
                          {message.external_id && (
                            <button
                              type="button"
                              className="absolute -top-2 right-1 flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 text-[#60716a] opacity-70 shadow-sm transition hover:opacity-100 focus-visible:opacity-100"
                              onClick={() => setReactionTargetId((current) => current === message.id ? null : message.id)}
                              aria-label="Reagir à mensagem"
                              title="Reagir à mensagem"
                            >
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {reactionTargetId === message.id && message.external_id && (
                            <div className="absolute bottom-full right-0 z-20 mb-2 flex max-w-[min(90vw,280px)] flex-wrap gap-1 rounded-lg border bg-white p-2 shadow-lg">
                              {reactionOptions.map((emoji) => (
                                <button key={emoji} type="button" className="rounded p-1 text-lg hover:bg-accent" onClick={() => void sendReaction(message, emoji)} aria-label={`Reagir com ${emoji}`}>
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                          {message.media_url && message.kind === "image" && (
                            <div className="mb-1">
                              {mediaStatus.loading && <div className="mb-2 rounded bg-[#f4f6f2] px-2 py-1 text-[10px] text-[#5d6d61]">Carregando imagem...</div>}
                              {!mediaStatus.error ? (
                                <img
                                  src={`${message.media_url}${message.media_url.includes("?") ? "&" : "?"}v=${mediaRetryKey}`}
                                  alt="Imagem recebida"
                                  loading="lazy"
                                  className="max-h-72 max-w-[320px] rounded object-cover"
                                  onLoad={() => setMediaStateMap((current) => ({ ...current, [message.id]: { loading: false, error: false } }))}
                                  onError={() => setMediaStateMap((current) => ({ ...current, [message.id]: { loading: false, error: true } }))}
                                />
                              ) : (
                                <div className="flex max-w-[320px] flex-col gap-2 rounded border border-dashed border-[#c8b7b3] bg-[#faf3f1] p-3 text-[11px] text-[#6c534d]">
                                  <span>Erro ao carregar a imagem.</span>
                                  <button
                                    type="button"
                                    className="w-fit rounded bg-[#f0d4d0] px-2 py-1 font-medium text-[#4b2e2b]"
                                    onClick={() => {
                                      setMediaRetryMap((current) => ({ ...current, [message.id]: (current[message.id] ?? 0) + 1 }));
                                      setMediaStateMap((current) => ({ ...current, [message.id]: { loading: true, error: false } }));
                                    }}
                                  >
                                    Tentar novamente
                                  </button>
                                </div>
                              )}
                              {message.message_text && <div className="mt-2 text-[11px] text-[#4a534d]">{message.message_text}</div>}
                            </div>
                          )}
                          {message.media_url && message.kind === "video" && (
                            <video
                              src={message.media_url}
                              controls
                              preload="metadata"
                              className="mb-1 max-h-72 max-w-[320px] rounded"
                            />
                          )}
                          {message.media_url && message.kind === "audio" && (
                            <AudioMessagePlayer src={message.media_url} voiceNote={message.is_voice_note} />
                          )}
                          {message.media_url && message.kind === "document" && (
                            <a
                              href={message.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mb-1 flex items-center gap-2 text-xs underline"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="min-w-0">
                                <span className="block truncate">{message.file_name || message.media_metadata?.name || "Abrir documento"}</span>
                                {(message.file_size_bytes || message.mime_type) && <span className="block text-[10px] text-muted-foreground">{message.file_size_bytes ? `${(message.file_size_bytes / (1024 * 1024)).toFixed(2)} MB` : message.mime_type}</span>}
                              </span>
                            </a>
                          )}
                          {message.media_url && message.kind === "sticker" && <img src={message.media_url} alt="Sticker" className="mb-1 max-h-40 max-w-40 object-contain" />}
                          {message.kind === "location" && message.media_metadata?.latitude && message.media_metadata?.longitude && <a className="mb-1 block text-xs underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${message.media_metadata.latitude},${message.media_metadata.longitude}`}>Abrir localização{message.media_metadata.address ? ` · ${message.media_metadata.address}` : ""}</a>}
                          {!message.media_url && (
                            <div className={message.message_text ? "" : "text-xs italic text-muted-foreground"}>
                              {message.message_text?.trim() || `${getMessagePreviewText(message)}${message.kind && message.kind !== "text" ? " indisponível" : " sem conteúdo"}`}
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#748178]">
                            {new Date(message.created_at).toLocaleTimeString(
                              "pt-AO",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                            {message.direction === "outbound" &&
                              (message.delivery_status === "read" ? (
                                <CheckCheck className="h-3 w-3 text-[#53a548]" />
                              ) : message.delivery_status === "delivered" ? (
                                <CheckCheck className="h-3 w-3" />
                              ) : (
                                <Check className="h-3 w-3" />
                              ))}
                          </div>
                        </div>
                      </div>
                      </Fragment>
                    );
                  })}
                </>
              ) : (
                <p className="m-auto text-sm text-[#756b62]">
                  Escolha uma conversa para ver o histórico.
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>
            {selected && (!atLatest || unreadInboundMessages.length > 0) && (
              <button
                type="button"
                onClick={jumpToLatestMessage}
                className="absolute bottom-20 right-5 z-20 flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-emerald-700 bg-emerald-600 px-3 text-white shadow-lg transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={`Ir para a mensagem mais recente${unreadInboundMessages.length ? `, ${unreadInboundMessages.length} não lidas` : ""}`}
                title="Ir para a mensagem mais recente"
              >
                <ArrowDown className="h-4 w-4" />
                {unreadInboundMessages.length > 0 && <span className="text-xs font-semibold tabular-nums">{unreadInboundMessages.length}</span>}
              </button>
            )}
            {selected && (
              <div className="sticky bottom-0 rounded-lg border border-[#d8d0c4] bg-[#f7f3ed] p-1.5">
                <div className="flex items-center gap-1">
                  <div className="relative"><Button className="h-8 w-8" size="icon" variant="ghost" aria-label="Adicionar emoji" onClick={() => setEmojiOpen((value) => !value)}><Smile className="h-4 w-4" /></Button>{emojiOpen && <div className="absolute bottom-10 left-0 z-30 grid w-56 grid-cols-8 gap-1 rounded-md border bg-background p-2 shadow-lg">{["😀","😂","😍","😊","👍","❤️","🎉","🙏","😢","😮","🔥","✨","👏","✅","💬","📍"].map((emoji) => <button type="button" key={emoji} className="rounded p-1 text-lg hover:bg-accent" onClick={() => { setText((value) => `${value}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div>}</div>
                  <label
                    className="cursor-pointer rounded-full p-1.5 text-[#5d6d61] hover:bg-[#e8e1d7]"
                    title="Anexar imagem, vídeo, áudio ou documento"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                      onChange={(event) =>
                        setMediaFile(event.target.files?.[0] || null)
                      }
                    />
                  </label>
                  <Input
                    className="h-8 border-0 bg-white text-sm shadow-none focus-visible:ring-0"
                    value={text}
                    onChange={(event) => void publishTyping(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={
                      recording
                        ? "A gravar áudio..."
                        : mediaFile
                          ? mediaFile.name
                          : "Escrever mensagem"
                    }
                  />
                  <Button
                    className="h-8 w-8"
                    size="icon"
                    variant={recording ? "destructive" : "ghost"}
                    onClick={() => void toggleRecording()}
                    aria-label={recording ? (recordingPaused ? "Continuar gravação" : "Pausar gravação") : "Gravar áudio"}
                  >
                    {recording ? (recordingPaused ? "▶" : "Ⅱ") : <Mic className="h-4 w-4" />}
                  </Button>
                  {recording && <><Button className="h-8 px-2 text-[11px]" size="sm" variant="outline" onClick={finishRecording}>Usar áudio</Button><Button className="h-8 px-2 text-[11px]" size="sm" variant="ghost" onClick={cancelRecording}>Cancelar</Button></>}
                  {recording && recordingPaused && recordingPreviewUrl && <audio src={recordingPreviewUrl} controls className="h-8 max-w-32" />}
                  <Button
                    className="h-8 w-8 rounded-full bg-[#128c7e] hover:bg-[#0d766a]"
                    size="icon"
                    disabled={sending || (!text.trim() && !mediaFile)}
                    onClick={() => void send()}
                  >
                    {sending ? (
                      <Mic className="h-4 w-4 animate-pulse" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {mediaFile && (
                  <div className="mt-2 space-y-2 rounded-md border bg-white/70 p-2 text-xs text-[#5d6d61]">
                    {mediaFile.type.startsWith("image/") && recordingPreviewUrl && <img src={recordingPreviewUrl} alt="Pré-visualização" className="max-h-36 max-w-full rounded object-contain" />}
                    {mediaFile.type.startsWith("video/") && recordingPreviewUrl && <video src={recordingPreviewUrl} controls className="max-h-36 max-w-full rounded" />}
                    {mediaFile.type.startsWith("audio/") && recordingPreviewUrl && <audio src={recordingPreviewUrl} controls className="w-full" />}
                    <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />{mediaFile.name}
                    <Input
                      className="h-7"
                      placeholder="Legenda"
                      value={mediaCaption}
                      onChange={(event) => setMediaCaption(event.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMediaFile(null)}
                    >
                      Remover
                    </Button>
                  </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {selected && (
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Perfil do cliente</DialogTitle>
              <DialogDescription>
                Dados reais do contacto e ações da conversa.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#d7b98e] text-xl font-semibold">
                  {selected.contact?.profile_picture_url ? <img src={selected.contact.profile_picture_url} alt="" className="h-full w-full object-cover" /> : getContactInitials(selected.contact?.name, selected.contact?.phone_number)}
                </div>
                <div>
                  <div className="text-lg font-semibold">
                    {selected.contact?.name || "Sem nome"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selected.contact?.phone_number}
                  </div>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Nome</label>
                  <Input
                    value={contactNameDraft || selected.contact?.custom_name || selected.contact?.name || ""}
                    onChange={(event) => setContactNameDraft(event.target.value)}
                    placeholder="Nome do contacto"
                  />
                  <Button size="sm" onClick={() => void saveContactName()}>Guardar nome</Button>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  {selected.response_mode === "human" || selected.status === "human"
                    ? "Atendimento humano"
                    : selected.status === "closed"
                      ? "Resolvida"
                      : "IA ativa"}
                </div>
                <div>
                  <span className="text-muted-foreground">Não lidas:</span>{" "}
                  {selected.unread_count}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Última interação:
                  </span>{" "}
                  {selected.last_message_at
                    ? new Date(selected.last_message_at).toLocaleString("pt-AO")
                    : "-"}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  onClick={() => {
                    void toggleAi();
                    setProfileOpen(false);
                  }}
                >
                  {selected.response_mode === "human" || selected.status === "human"
                    ? "Devolver à IA"
                    : "Assumir atendimento"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void resolveConversation();
                    setProfileOpen(false);
                  }}
                >
                  {selected.status === "closed" ? "Reabrir" : "Resolver"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuickAction("order");
                    setProfileOpen(false);
                  }}
                >
                  Criar pedido
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuickAction("appointment");
                    setProfileOpen(false);
                  }}
                >
                  Agendar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>Crie uma conversa com um contacto novo ou existente.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Nome do contacto</label>
              <Input value={newConversationForm.name} onChange={(event) => setNewConversationForm({ ...newConversationForm, name: event.target.value })} placeholder="Carlos" />
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Código do país</label>
                <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={newConversationForm.countryCode} onChange={(event) => setNewConversationForm({ ...newConversationForm, countryCode: event.target.value })}>
                  <option value="+244">+244</option>
                  <option value="+1">+1</option>
                  <option value="+351">+351</option>
                  <option value="+55">+55</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Número</label>
                <Input value={newConversationForm.phone} onChange={(event) => setNewConversationForm({ ...newConversationForm, phone: event.target.value })} placeholder="962001405" />
              </div>
            </div>
            <Button onClick={() => void openNewConversation()}>Iniciar conversa</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(quickAction)}
        onOpenChange={(open) => !open && setQuickAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quickAction === "appointment"
                ? "Novo agendamento"
                : "Novo pedido"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {quickAction === "appointment" ? (
              <>
                <Input
                  placeholder="Serviço"
                  value={quickForm.service}
                  onChange={(event) =>
                    setQuickForm({ ...quickForm, service: event.target.value })
                  }
                />
                <DateTimeSelect
                  value={quickForm.scheduled_at}
                  onChange={(scheduled_at) =>
                    setQuickForm({ ...quickForm, scheduled_at })
                  }
                  required
                />
              </>
            ) : (
              <Input
                placeholder="Produto ou descrição"
                value={quickForm.item}
                onChange={(event) =>
                  setQuickForm({ ...quickForm, item: event.target.value })
                }
              />
            )}
            <Textarea
              placeholder="Nota interna"
              value={quickForm.notes}
              onChange={(event) =>
                setQuickForm({ ...quickForm, notes: event.target.value })
              }
            />
            <Button onClick={() => void createQuickAction()}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
