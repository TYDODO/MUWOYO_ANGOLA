import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Forward,
  MoreVertical,
  Smile,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessMembership } from "@/hooks/useBusinessMembership";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DateTimeSelect from "@/components/DateTimeSelect";

const db = supabase as any;
async function getFunctionErrorMessage(error: { message?: string; context?: unknown } | null, fallback: string) {
  if (error?.context instanceof Response) {
    try {
      const body = await error.context.clone().json() as { error?: unknown; details?: unknown };
      const summary = typeof body.error === "string" ? body.error.replaceAll("_", " ") : "";
      const details = typeof body.details === "string" ? body.details : "";
      const responseMessage = [summary, details].filter(Boolean).join(": ");
      if (responseMessage) return responseMessage;
    } catch {
      // Fall back to the SDK error when the response is not JSON.
    }
  }
  return error?.message || fallback;
}

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
    stage?: InboxCategory | null;
    tags?: InboxCategory[];
  };
};
type InboxAttendant = { user_id: string; name: string | null; email: string };
type InboxSyncResponse = { cached?: boolean; historyPending?: number; webhookConfigured?: boolean };
type InboxCategory = { id: string; name: string; color: string };
const DEFAULT_INBOX_TAG_COLOR = "#0f766e";

function isMissingColorColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42703"
    || error.code === "PGRST204"
    || /could not find .*color|column .*color.* does not exist|schema cache.*color/i.test(error.message || "")
  ));
}

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
  from_me?: boolean;
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

function getCategoryTextColor(color: string) {
  const hex = color.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(hex)) return "#ffffff";
  const [red, green, blue] = [0, 2, 4]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179 ? "#17211d" : "#ffffff";
}

export default function Inbox() {
  const { user } = useAuth();
  const { membership, ownerUserId, isOwner, hasPermission } = useBusinessMembership();
  const { entitlements, planName, loading } = usePlanEntitlements();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [inboxTags, setInboxTags] = useState<InboxCategory[]>([]);
    const [attendants, setAttendants] = useState<InboxAttendant[]>([]);
  const [instances, setInstances] = useState<{ instance_name: string; phone: string | null; connection_state: string | null }[]>([]);
  const [activeInstance, setActiveInstance] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationSelectionMode, setConversationSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [messageSelectionMode, setMessageSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTargetId, setForwardTargetId] = useState("");
  const [forwardSearch, setForwardSearch] = useState("");
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
    customer_name: "",
    customer_phone: "",
    location: "",
    price: "",
    quantity: "1",
    delivery_fee: "0",
    discount: "0",
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [recordedVoiceNote, setRecordedVoiceNote] = useState(false);
  const [mediaCaption, setMediaCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const reactionPressTimerRef = useRef<number | null>(null);
  const [mediaRetryMap, setMediaRetryMap] = useState<Record<string, number>>({});
  const [mediaStateMap, setMediaStateMap] = useState<Record<string, { loading: boolean; error: boolean }>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; alt: string } | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", color: "#0f766e" });
  const [savingTag, setSavingTag] = useState(false);
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
  const profileSyncPromiseRef = useRef<Promise<void> | null>(null);
  const markedReadMessageIdsRef = useRef(new Set<string>());
  const readReconciledConversationsRef = useRef(new Set<string>());
  const readRequestsInFlightRef = useRef(new Set<string>());
  const pendingInitialScrollConversationRef = useRef<string | null>(null);
  const scrollAfterLoadRef = useRef(false);
  const inboxLoadErrorRef = useRef<string | null>(null);

  const load = async () => {
    if (!user || !ownerUserId) return;
    const { data: instanceRows, error: instancesError } = await db.from("instances").select("instance_name,phone,connection_state").eq("user_id", ownerUserId).order("created_at");
    if (instancesError) {
      if (inboxLoadErrorRef.current !== instancesError.message) {
        inboxLoadErrorRef.current = instancesError.message;
        toast({ title: "Não foi possível carregar as contas de WhatsApp", description: instancesError.message, variant: "destructive" });
      }
      return;
    }
    const nextInstances = instanceRows || [];
    setInstances(nextInstances);
    const instanceName = activeInstance || nextInstances[0]?.instance_name;
    if (!instanceName) {
      setConversations([]);
      setInboxTags([]);
      setSelected(null);
      return;
    }
    if (!activeInstance) setActiveInstance(instanceName);
    let conversationsQuery = db
      .from("inbox_conversations")
      .select("id,contact_id,status,assigned_to,unread_count,last_message_at,last_message_preview,last_message_direction,last_message_kind,response_mode,instance_name")
      .eq("user_id", ownerUserId)
      .eq("instance_name", instanceName)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (membership?.role === "attendant") conversationsQuery = conversationsQuery.eq("assigned_to", user.id);
    const [conversationResult, contactResult, { data: metadataRows }, stageResult, tagResult, { data: tagLinks }] = await Promise.all([
      conversationsQuery,
      db
        .from("whatsapp_contacts")
        .select("id,name,custom_name,phone_number,profile_picture_url,is_group")
        .eq("user_id", ownerUserId)
        .eq("instance_name", instanceName),
      db.from("crm_contact_metadata").select("contact_id,stage_id").eq("user_id", ownerUserId),
      db.from("crm_stages").select("id,name,color").eq("user_id", ownerUserId),
      db.from("crm_tags").select("id,name,color").eq("user_id", ownerUserId),
      db.from("crm_contact_tags").select("contact_id,tag_id").eq("user_id", ownerUserId),
    ]);
    const loadError = conversationResult.error || contactResult.error;
    if (loadError) {
      if (inboxLoadErrorRef.current !== loadError.message) {
        inboxLoadErrorRef.current = loadError.message;
        toast({
          title: membership?.role === "attendant" ? "Não foi possível carregar as conversas atribuídas" : "Não foi possível carregar as conversas",
          description: loadError.message,
          variant: "destructive",
        });
      }
      setConversations([]);
      return;
    }
    inboxLoadErrorRef.current = null;
    const rows = conversationResult.data;
    const contacts = contactResult.data;
    const [{ data: stageFallback }, { data: tagFallback }] = await Promise.all([
      stageResult.error && isMissingColorColumn(stageResult.error)
        ? db.from("crm_stages").select("id,name").eq("user_id", ownerUserId)
        : Promise.resolve({ data: null }),
      tagResult.error && isMissingColorColumn(tagResult.error)
        ? db.from("crm_tags").select("id,name").eq("user_id", ownerUserId)
        : Promise.resolve({ data: null }),
    ]);
    const stageRows = (stageResult.data || stageFallback || []).map((stage: Partial<InboxCategory>) => ({ ...stage, color: stage.color || "#64748b" }));
    const tagRows = (tagResult.data || tagFallback || []).map((tag: Partial<InboxCategory>) => ({ ...tag, color: tag.color || DEFAULT_INBOX_TAG_COLOR }));
    const stageMap = new Map<string, InboxCategory>(
      (stageRows || []).map((stage: InboxCategory) => [stage.id, stage]),
    );
    const tagMap = new Map<string, InboxCategory>(
      (tagRows || []).map((tag: InboxCategory) => [tag.id, tag]),
    );
    const metadataMap = new Map<string, { stage_id: string | null }>(
      (metadataRows || []).map((metadata: { contact_id: string; stage_id: string | null }) => [metadata.contact_id, metadata]),
    );
    const tagsByContact = new Map<string, InboxCategory[]>();
    (tagLinks || []).forEach((link: { contact_id: string; tag_id: string }) => {
      const tag = tagMap.get(link.tag_id);
      if (tag) tagsByContact.set(link.contact_id, [...(tagsByContact.get(link.contact_id) || []), tag]);
    });
    setInboxTags(tagRows || []);
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
          const metadata = metadataMap.get(row.contact_id);
          return {
            ...row,
            unread_count: readReconciledConversationsRef.current.has(row.id) ? 0 : row.unread_count,
            contact: contact ? {
              ...contact,
              name: contact.custom_name || contact.name,
              stage: metadata?.stage_id ? stageMap.get(metadata.stage_id) || null : null,
              tags: tagsByContact.get(row.contact_id) || [],
            } : undefined,
          };
        });
    setConversations(mappedConversations);
    setSelected((current) => current
      ? mappedConversations.find((conversation: Conversation) => conversation.id === current.id) || current
      : current);
  };

  const syncContactProfiles = async () => {
    if (!user || !ownerUserId) return;
    if (profileSyncPromiseRef.current) return profileSyncPromiseRef.current;

    const syncTask = (async () => {
      let cursor: string | undefined;
      let failedProfiles = 0;
      while (true) {
        const { data, error } = await supabase.functions.invoke("whatsapp-contact-profiles", {
          body: { instanceName: activeInstance || undefined, cursor, pageSize: 30 },
        });
        if (error || data?.error) {
          toast({
            title: "Não foi possível atualizar nomes e fotos dos contactos",
            description: error?.message || data?.message || data?.details || data?.error || "Tente sincronizar novamente.",
            variant: "destructive",
          });
          return;
        }
        failedProfiles += Number(data?.failed) || 0;
        if (!data?.hasMore) break;
        if (typeof data?.nextCursor !== "string" || data.nextCursor === cursor) {
          toast({
            title: "Sincronização de perfis incompleta",
            description: "A paginação não avançou. Tente sincronizar novamente.",
            variant: "destructive",
          });
          return;
        }
        cursor = data.nextCursor;
      }
      if (failedProfiles > 0) {
        toast({
          title: "Perfis parcialmente atualizados",
          description: `${failedProfiles} contacto(s) não puderam ser atualizados. Tente sincronizar novamente.`,
          variant: "destructive",
        });
      }
    })().finally(() => {
      profileSyncPromiseRef.current = null;
    });
    profileSyncPromiseRef.current = syncTask;
    return syncTask;
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
        let chatOffset = 0;
        const processedOffsets = new Set<number>();
        while (true) {
          if (processedOffsets.has(chatOffset)) {
            if (!silent) toast({
              title: "Sincronização incompleta",
              description: "A sincronização não avançou para a próxima página. Tente novamente.",
              variant: "destructive",
            });
            break;
          }
          processedOffsets.add(chatOffset);
          const { data, error } = await supabase.functions.invoke("inbox-sync", {
            body: { instanceName: activeInstance || undefined, chatOffset },
          });
          if (error || data?.error) {
            if (!silent) toast({
                title: "Sincronização parcial",
                description: typeof data?.error === "string" ? data.error : "As conversas guardadas continuam disponíveis. A sincronização WhatsApp será repetida quando a ligação voltar.",
                variant: "destructive",
              });
            break;
          }
          lastSync = data;
          if (data?.cached || !data?.hasMoreChats) break;
          const nextOffset = Number(data?.nextChatOffset);
          if (!Number.isInteger(nextOffset) || nextOffset <= chatOffset) {
            if (!silent) toast({
              title: "Sincronização incompleta",
              description: "Não foi possível avançar na lista de conversas. Tente novamente.",
              variant: "destructive",
            });
            break;
          }
          chatOffset = nextOffset;
        }
        if (lastSync && !lastSync.cached) await syncContactProfiles();
        if (!silent && lastSync?.cached) {
          toast({ title: "WhatsApp indisponível", description: "A mostrar as conversas já sincronizadas. A sincronização será repetida quando o telefone voltar a estar online." });
        } else if (!silent && lastSync?.historyPending > 0) {
          toast({ title: "Conversas sincronizadas", description: `Ainda há ${lastSync.historyPending} históricos para importar. Use Sincronizar novamente para continuar.` });
        } else if (!silent && lastSync?.webhookConfigured === false) {
          toast({ title: "Webhook WhatsApp não configurado", description: "A sincronização das conversas foi concluída, mas a Evolution não confirmou o webhook. As mensagens novas podem não chegar até a configuração ser corrigida.", variant: "destructive" });
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

  const markMessagesRead = useCallback(async (conversationId = selectedRef.current?.id) => {
    if (!conversationId || readRequestsInFlightRef.current.has(conversationId)) return;
    readRequestsInFlightRef.current.add(conversationId);
    try {
      const { data, error } = await supabase.functions.invoke("mark-conversation-read", {
        body: { conversationId },
      });
      if (error || !data?.ok) {
        const errorMessage = await getFunctionErrorMessage(error, data?.details || data?.error || "Tente novamente.");
        toast({
          title: "Não foi possível marcar a conversa como lida",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      const readIds = new Set<string>(
        (Array.isArray(data.markedMessageIds) ? data.markedMessageIds : [])
          .filter((id: unknown): id is string => typeof id === "string"),
      );
      if (data.unreadCountReconciled === false) {
        toast({
          title: "Mensagens lidas; contador a sincronizar",
          description: "As mensagens foram marcadas como lidas, mas o contador antigo não foi atualizado. Sincronize novamente.",
          variant: "destructive",
        });
      }
      readIds.forEach((id) => markedReadMessageIdsRef.current.add(id));
      setMessages((current) => current.map((message) =>
        readIds.has(message.id)
          ? { ...message, delivery_status: "read", read_at: message.read_at || new Date().toISOString() }
          : message,
      ));
      if (data.unreadCountReconciled !== false) {
        readReconciledConversationsRef.current.add(conversationId);
      }
      setConversations((current) => current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread_count: 0 }
          : conversation,
      ));
      setSelected((current) => current?.id === conversationId
        ? { ...current, unread_count: 0 }
        : current);
    } catch (error) {
      toast({
        title: "Não foi possível marcar a conversa como lida",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      readRequestsInFlightRef.current.delete(conversationId);
    }
  }, [toast]);

  const loadMessages = async (conversation: Conversation) => {
    if (!user || !ownerUserId) return;
    const requestSequence = ++messageLoadSequenceRef.current;
    const { data, error } = await db
      .from("messages")
      .select(
        "id,direction,message_text,ai_responded,created_at,kind,media_url,media_metadata,delivery_status,read_at,from_me,external_id,is_voice_note,file_name,file_size_bytes,mime_type,is_historical",
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
    const loadedMessages = (data || []).reverse() as Message[];
    if (pendingInitialScrollConversationRef.current === conversation.id) {
      pendingInitialScrollConversationRef.current = null;
      scrollAfterLoadRef.current = loadedMessages.length > 0;
    }
    setMessages(loadedMessages);
    const unreadMessageIds = loadedMessages
      .filter((message) =>
        message.direction === "inbound"
        && !message.from_me
        && !message.is_historical
        && message.delivery_status !== "read"
        && !message.read_at,
      )
      .map((message) => message.id);
    if (
      !readReconciledConversationsRef.current.has(conversation.id)
      || unreadMessageIds.some((id) => !markedReadMessageIdsRef.current.has(id))
    ) {
      void markMessagesRead(conversation.id);
    }
  };

  const selectConversation = (conversation: Conversation) => {
    markedReadMessageIdsRef.current.clear();
    readReconciledConversationsRef.current.delete(conversation.id);
    pendingInitialScrollConversationRef.current = conversation.id;
    scrollAfterLoadRef.current = false;
    setMessageSelectionMode(false);
    setSelectedMessageIds(new Set());
    setReactionTargetId(null);
    selectedRef.current = conversation;
    setSelected(conversation);
    setMessages([]);
    setAtLatest(true);
    void loadMessages(conversation);
  };
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useLayoutEffect(() => {
    if (!scrollAfterLoadRef.current) return;
    scrollAfterLoadRef.current = false;
    const root = messageScrollRef.current;
    if (root) root.scrollTo({ top: root.scrollHeight, behavior: "instant" });
    else messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    setAtLatest(true);
  }, [messages]);

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
      setRecordedVoiceNote(true);
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
    setRecordedVoiceNote(false);
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
                      : filter.startsWith("tag:")
                        ? conversation.contact?.tags?.some((tag) => tag.id === filter.slice(4)) || false
                        : true;
        return matchesSearch && matchesFilter;
      }),
    [conversations, filter, search, user],
  );

  const createInboxTag = async () => {
    if (!user || !newTag.name.trim()) return;
    setSavingTag(true);
    const payload = {
      user_id: ownerUserId || user.id,
      name: newTag.name.trim(),
      color: newTag.color,
    };
    let result = await db.from("crm_tags").insert(payload);
    const missingColor = isMissingColorColumn(result.error);
    if (missingColor) {
      const { color: _color, ...legacyPayload } = payload;
      result = await db.from("crm_tags").insert(legacyPayload);
    }
    setSavingTag(false);
    if (result.error) {
      toast({ title: "Não foi possível criar a etiqueta", description: result.error.message, variant: "destructive" });
      return;
    }
    setNewTag({ name: "", color: "#0f766e" });
    await load();
    toast({
      title: "Etiqueta adicionada ao segmentador",
      ...(missingColor ? { description: "A etiqueta foi criada. Para guardar cores personalizadas, aplique a migration de cores do CRM no Supabase." } : {}),
    });
  };

  const updateInboxTag = async (tag: InboxCategory, patch: { name?: string; color?: string }) => {
    if (!ownerUserId) return;
    const { error } = await db.from("crm_tags").update(patch).eq("id", tag.id).eq("user_id", ownerUserId);
    if (error) {
      toast({
        title: "Não foi possível atualizar a etiqueta",
        description: isMissingColorColumn(error) ? "Aplique a migration crm_category_colors no Supabase para guardar cores." : error.message,
        variant: "destructive",
      });
      return;
    }
    setInboxTags((current) => current.map((item) => item.id === tag.id ? { ...item, ...patch } : item));
    setConversations((current) => current.map((conversation) => ({
      ...conversation,
      contact: conversation.contact ? {
        ...conversation.contact,
        tags: conversation.contact.tags?.map((item) => item.id === tag.id ? { ...item, ...patch } : item),
      } : undefined,
    })));
    setSelected((current) => current ? {
      ...current,
      contact: current.contact ? {
        ...current.contact,
        tags: current.contact.tags?.map((item) => item.id === tag.id ? { ...item, ...patch } : item),
      } : undefined,
    } : current);
    toast({ title: "Etiqueta atualizada" });
  };

  const deleteInboxTag = async (tag: InboxCategory) => {
    if (!ownerUserId || !window.confirm(`Eliminar a etiqueta "${tag.name}"?`)) return;
    const { error } = await db.from("crm_tags").delete().eq("id", tag.id).eq("user_id", ownerUserId);
    if (error) {
      toast({ title: "Não foi possível eliminar a etiqueta", description: error.message, variant: "destructive" });
      return;
    }
    if (filter === `tag:${tag.id}`) setFilter("all");
    setInboxTags((current) => current.filter((item) => item.id !== tag.id));
    setConversations((current) => current.map((conversation) => ({
      ...conversation,
      contact: conversation.contact
        ? { ...conversation.contact, tags: conversation.contact.tags?.filter((item) => item.id !== tag.id) }
        : undefined,
    })));
    setSelected((current) => current ? {
      ...current,
      contact: current.contact
        ? { ...current.contact, tags: current.contact.tags?.filter((item) => item.id !== tag.id) }
        : undefined,
    } : current);
    toast({ title: "Etiqueta eliminada" });
  };

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
    const isHuman = selected.response_mode === "human" || selected.status === "human";
    const nextMode = isHuman ? "ai" : "human";
    const { error } = await db
      .from("inbox_conversations")
      .update({ response_mode: nextMode, status: nextMode === "ai" ? "open" : "human" })
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
      status: nextMode === "ai" ? "open" : "human",
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
    const quantity = Number(quickForm.quantity);
    const price = Number(quickForm.price);
    const deliveryFee = Number(quickForm.delivery_fee);
    const discount = Number(quickForm.discount);
    if (quickAction === "order" && (
      !quickForm.customer_name.trim()
      || !quickForm.item.trim()
      || !Number.isFinite(quantity) || quantity < 1
      || !quickForm.price.trim() || !Number.isFinite(price) || price < 0
      || !Number.isFinite(deliveryFee) || deliveryFee < 0
      || !Number.isFinite(discount) || discount < 0
    )) {
      return toast({
        title: "Dados do pedido inválidos",
        description: "Preencha cliente e produto, e informe valores válidos iguais ou superiores a zero.",
        variant: "destructive",
      });
    }
    const subtotal = price * quantity;
    const total = subtotal + deliveryFee - discount;
    if (quickAction === "order" && total < 0) {
      return toast({
        title: "Desconto inválido",
        description: "O desconto não pode ser superior ao subtotal mais a entrega.",
        variant: "destructive",
      });
    }
    const result =
      quickAction === "appointment"
        ? await db
            .from("appointments")
            .insert({
              user_id: ownerUserId,
              customer_name: quickForm.customer_name.trim() || selected.contact.name,
              customer_phone: quickForm.customer_phone.trim() || selected.contact.phone_number,
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
              customer_name: quickForm.customer_name.trim(),
              customer_phone: quickForm.customer_phone.replace(/\D/g, "") || selected.contact.phone_number,
              customer_location: quickForm.location || null,
              items: [
                { name: quickForm.item.trim(), qty: quantity, price },
              ],
              subtotal,
              delivery_fee: deliveryFee,
              discount,
              total,
              delivery_address: quickForm.location || null,
              notes: quickForm.notes || null,
              status: "new",
              delivery_status: "awaiting_pickup",
            });
    if (result.error)
      return toast({
        title: "Não foi possível criar",
        description: result.error.message,
        variant: "destructive",
      });
    setQuickAction(null);
    setQuickForm({
      service: "",
      item: "",
      scheduled_at: "",
      notes: "",
      customer_name: "",
      customer_phone: "",
      location: "",
      price: "",
      quantity: "1",
      delivery_fee: "0",
      discount: "0",
    });
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
          isVoiceNote: recordedVoiceNote,
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
      setRecordedVoiceNote(false);
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

  const sendReaction = async (message: Message, reaction: string, notify = true) => {
    if (!selected || !user || !ownerUserId || !message.external_id) return false;
    const { data: instance } = await db.from("instances").select("instance_name").eq("user_id", ownerUserId).eq("instance_name", selected.instance_name || activeInstance).maybeSingle();
    if (!instance?.instance_name) return false;
    const { error } = await supabase.functions.invoke("inbox-send", { body: { instanceName: instance.instance_name, phoneNumber: selected.contact?.phone_number, kind: "reaction", reaction, messageKey: { id: message.external_id, remoteJid: `${selected.contact?.phone_number}@s.whatsapp.net`, fromMe: message.direction === "outbound" } } });
    if (error) {
      if (notify) toast({ title: "Não foi possível reagir", description: error.message, variant: "destructive" });
      return false;
    }
    setReactionTargetId(null);
    if (notify) toast({ title: "Reação enviada", description: `Você reagiu com ${reaction}` });
    return true;
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
    const { data: savedContact, error } = await db
      .from("whatsapp_contacts")
      .update({ custom_name: nextName || null })
      .eq("id", selected.contact_id)
      .eq("user_id", ownerUserId)
      .select("name")
      .single();

    if (error) {
      toast({ title: "Não foi possível guardar o nome", description: error.message, variant: "destructive" });
      return;
    }

    await load();
    setContactNameDraft(nextName || savedContact?.name || "");
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

  const toggleConversationSelection = (conversationId: string) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  };

  const runBulkConversationAction = async (action: "archive" | "delete") => {
    const targets = conversations.filter((conversation) =>
      selectedConversationIds.has(conversation.id) && conversation.contact?.phone_number,
    );
    if (!targets.length || !activeInstance) return;
    if (action === "delete" && !window.confirm(`Eliminar ${targets.length} conversa(s) e as mensagens associadas?`)) return;
    setBulkActionBusy(true);
    const failedIds = new Set<string>();
    for (const conversation of targets) {
      try {
        const { data, error } = await supabase.functions.invoke("inbox-actions", {
          body: {
            action,
            instanceName: conversation.instance_name || activeInstance,
            phoneNumber: conversation.contact?.phone_number,
          },
        });
        if (error || !data?.ok) failedIds.add(conversation.id);
      } catch {
        failedIds.add(conversation.id);
      }
    }
    if (action === "delete" && selected && selectedConversationIds.has(selected.id) && !failedIds.has(selected.id)) {
      setSelected(null);
      selectedRef.current = null;
      setMessages([]);
    }
    setSelectedConversationIds(failedIds);
    setConversationSelectionMode(failedIds.size > 0);
    await load();
    setBulkActionBusy(false);
    toast({
      title: failedIds.size ? "Ação parcialmente concluída" : action === "delete" ? "Conversas eliminadas" : "Conversas arquivadas",
      description: failedIds.size ? `${failedIds.size} de ${targets.length} conversa(s) não puderam ser processadas.` : `${targets.length} conversa(s) processada(s).`,
      variant: failedIds.size ? "destructive" : "default",
    });
  };

  const runBulkMessageReaction = async (reaction: string) => {
    const targets = messages.filter((message) => selectedMessageIds.has(message.id) && message.external_id);
    if (!targets.length) return;
    setBulkActionBusy(true);
    const results = await Promise.all(targets.map(async (message) => {
      try {
        return await sendReaction(message, reaction, false);
      } catch {
        return false;
      }
    }));
    const succeeded = results.filter(Boolean).length;
    setSelectedMessageIds(new Set());
    setMessageSelectionMode(false);
    setBulkActionBusy(false);
    toast({
      title: succeeded === targets.length ? "Reações enviadas" : "Reações parcialmente enviadas",
      description: `${succeeded} de ${targets.length} mensagem(ns) receberam ${reaction}.`,
      variant: succeeded === targets.length ? "default" : "destructive",
    });
  };

  const deleteSelectedMessages = async () => {
    if (!selected || !selectedMessageIds.size || selectedMessageIds.size > 100 || bulkActionBusy) return;
    const conversation = selected;
    const messageIds = [...selectedMessageIds];
    if (!window.confirm(`Eliminar ${messageIds.length} mensagem(ns) do histórico local? As mensagens no WhatsApp não serão alteradas.`)) return;
    setBulkActionBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-actions", {
        body: { action: "delete_messages", conversationId: conversation.id, messageIds },
      });
      if (error || !data?.ok) {
        const errorMessage = await getFunctionErrorMessage(error, data?.error || "Tente novamente.");
        toast({ title: "Não foi possível eliminar as mensagens", description: errorMessage, variant: "destructive" });
        return;
      }
      setSelectedMessageIds(new Set());
      setMessageSelectionMode(false);
      if (selectedRef.current?.id === conversation.id) await loadMessages(conversation);
      toast({ title: "Mensagens eliminadas do histórico local", description: `${data.deletedCount} mensagem(ns) eliminada(s).` });
    } catch (error) {
      toast({
        title: "Não foi possível eliminar as mensagens",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBulkActionBusy(false);
    }
  };

  const forwardSelectedMessages = async () => {
    if (!selected || !selectedMessageIds.size || selectedMessageIds.size > 100 || bulkActionBusy) return;
    const target = conversations.find((conversation) => conversation.id === forwardTargetId);
    if (!target?.contact?.phone_number) return;
    setBulkActionBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-actions", {
        body: {
          action: "forward_messages",
          conversationId: selected.id,
          messageIds: [...selectedMessageIds],
          targetPhoneNumber: target.contact.phone_number,
        },
      });
      if (error || !data) {
        const errorMessage = await getFunctionErrorMessage(error, "Tente novamente.");
        toast({ title: "Não foi possível reencaminhar as mensagens", description: errorMessage, variant: "destructive" });
        return;
      }
      const forwardedCount = Number(data.forwardedCount) || 0;
      const failedCount = Number(data.failedCount) || 0;
      if (forwardedCount === 0) {
        toast({ title: "Nenhuma mensagem foi reencaminhada", description: failedCount ? `${failedCount} mensagem(ns) não puderam ser processadas.` : data.error || "Verifique se as mensagens ainda estão disponíveis no WhatsApp.", variant: "destructive" });
        return;
      }
      setForwardOpen(false);
      setForwardTargetId("");
      setForwardSearch("");
      if (failedCount === 0) {
        setSelectedMessageIds(new Set());
        setMessageSelectionMode(false);
      }
      await loadMessages(selected);
      toast({
        title: failedCount ? "Reencaminhamento parcial" : "Mensagens reencaminhadas",
        description: `${forwardedCount} enviada(s)${failedCount ? ` · ${failedCount} não enviada(s)` : ""} para ${target.contact.name || target.contact.phone_number}.`,
        variant: failedCount ? "destructive" : "default",
      });
    } catch (error) {
      toast({ title: "Não foi possível reencaminhar as mensagens", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setBulkActionBusy(false);
    }
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
    && !message.from_me
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
  const startReactionPress = (messageId: string) => {
    if (reactionPressTimerRef.current !== null) window.clearTimeout(reactionPressTimerRef.current);
    reactionPressTimerRef.current = window.setTimeout(() => setReactionTargetId(messageId), 550);
  };
  const cancelReactionPress = () => {
    if (reactionPressTimerRef.current !== null) window.clearTimeout(reactionPressTimerRef.current);
    reactionPressTimerRef.current = null;
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
      mobileFullscreen
      title={entitlements.sharedInbox ? "Shared Inbox" : "Inbox"}
      description="Converse com clientes e acompanhe o contexto do CRM."
    >
      <div
        data-inbox
        data-has-selection={selected ? "true" : "false"}
        className="grid h-dvh min-h-0 gap-3 overflow-hidden lg:h-[calc(100dvh-8rem)] lg:min-h-0 lg:grid-cols-[minmax(230px,30%)_minmax(0,70%)]"
      >
        <Card className="inbox-conversation-list flex min-h-0 min-w-0 flex-col overflow-hidden border-0 shadow-none">
          <CardHeader className="shrink-0 px-2 py-2">
            <div className="mb-1 px-1 text-sm font-semibold text-foreground lg:hidden">Inbox Muwoyo</div>
            <div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">Conversas</CardTitle><Button size="sm" className="h-7 px-2 text-[11px]" disabled={syncing} onClick={() => void syncInbox()}>{syncing ? "A sincronizar..." : "Sincronizar"}</Button></div>
            <Button size="sm" className="mt-2 h-8 w-full" onClick={() => setNewConversationOpen(true)}>+ Nova conversa</Button>
            {instances.length > 1 && <select className="h-8 rounded-md border bg-background px-2 text-xs" value={activeInstance} onChange={(event) => { setActiveInstance(event.target.value); setSelected(null); setMessages([]); }}>{instances.map((instance) => <option key={instance.instance_name} value={instance.instance_name}>{instance.phone || instance.instance_name}</option>)}</select>}
            <Input
              className="h-8 text-xs"
              placeholder="Pesquisar nome ou número"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant={conversationSelectionMode ? "default" : "outline"}
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  setConversationSelectionMode((current) => !current);
                  setSelectedConversationIds(new Set());
                }}
              >
                {conversationSelectionMode ? "Cancelar seleção" : "Selecionar conversas"}
              </Button>
              {conversationSelectionMode && (
                <>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setSelectedConversationIds(new Set(visible.map((conversation) => conversation.id)))}>
                    Selecionar visíveis
                  </Button>
                  <span className="text-[11px] text-muted-foreground">{selectedConversationIds.size} selecionada(s)</span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={!selectedConversationIds.size || bulkActionBusy} onClick={() => void runBulkConversationAction("archive")}>
                    Arquivar
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]" disabled={!selectedConversationIds.size || bulkActionBusy} onClick={() => void runBulkConversationAction("delete")}>
                    Eliminar
                  </Button>
                </>
              )}
            </div>
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
              {inboxTags.map((tag) => {
                const active = filter === `tag:${tag.id}`;
                return (
                  <Button
                    key={tag.id}
                    className="h-7 shrink-0 px-2 text-[11px] font-semibold"
                    size="sm"
                    variant="outline"
                    style={{
                      borderColor: tag.color,
                      backgroundColor: active ? tag.color : undefined,
                      color: active ? getCategoryTextColor(tag.color) : undefined,
                    }}
                    onClick={() => setFilter(active ? "all" : `tag:${tag.id}`)}
                  >
                    {tag.name}
                  </Button>
                );
              })}
              {isOwner && (
                <Button
                  className="h-7 shrink-0 px-2 text-[11px]"
                  size="sm"
                  variant="outline"
                  onClick={() => setTagManagerOpen(true)}
                >
                  + Etiquetas
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {visible.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => conversationSelectionMode
                  ? toggleConversationSelection(conversation.id)
                  : selectConversation(conversation)}
                className={`inbox-conversation-row w-full p-2 text-left ${selected?.id === conversation.id ? "is-selected" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {conversationSelectionMode && (
                    <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${selectedConversationIds.has(conversation.id) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                      {selectedConversationIds.has(conversation.id) ? "✓" : ""}
                    </span>
                  )}
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
                    {(conversation.contact?.stage || conversation.contact?.tags?.length) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {conversation.contact.stage && (
                          <Badge className="h-5 px-1.5 text-[10px] font-semibold shadow-sm" style={{ backgroundColor: conversation.contact.stage.color, color: getCategoryTextColor(conversation.contact.stage.color) }}>
                            {conversation.contact.stage.name}
                          </Badge>
                        )}
                        {conversation.contact.tags?.map((tag) => (
                          <Badge key={tag.id} className="h-5 px-1.5 text-[10px] font-semibold shadow-sm" style={{ backgroundColor: tag.color, color: getCategoryTextColor(tag.color) }}>
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
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
            <div className="mb-1 text-sm font-semibold text-foreground lg:hidden">Inbox Muwoyo</div>
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
                onClick={() => {
                  if (selected?.contact?.profile_picture_url) {
                    setPreviewMedia({ url: selected.contact.profile_picture_url, alt: `Foto de perfil de ${selected.contact.name || selected.contact.phone_number}` });
                  } else if (selected) {
                    setProfileOpen(true);
                  }
                }}
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
                <Button
                  type="button"
                  size="sm"
                  variant={messageSelectionMode ? "default" : "outline"}
                  className="h-8 shrink-0 px-2 text-xs"
                  onClick={() => {
                    setMessageSelectionMode((current) => !current);
                    setSelectedMessageIds(new Set());
                  }}
                >
                  {messageSelectionMode ? "Cancelar seleção" : "Selecionar mensagens"}
                </Button>
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
            {messageSelectionMode && (
              <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border bg-white/90 p-1.5">
                <span className="mr-1 text-xs text-muted-foreground">{selectedMessageIds.size} selecionada(s)</span>
                {reactionOptions.map((reaction) => (
                  <Button
                    key={reaction}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-base"
                    disabled={!selectedMessageIds.size || bulkActionBusy}
                    onClick={() => void runBulkMessageReaction(reaction)}
                    aria-label={`Reagir em massa com ${reaction}`}
                  >
                    {reaction}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedMessageIds.size || selectedMessageIds.size > 100 || bulkActionBusy}
                  onClick={() => setForwardOpen(true)}
                >
                  <Forward className="mr-1 h-3 w-3" />
                  Reencaminhar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-[11px]"
                  disabled={!selectedMessageIds.size || selectedMessageIds.size > 100 || bulkActionBusy}
                  onClick={() => void deleteSelectedMessages()}
                >
                  Eliminar selecionadas
                </Button>
                <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[11px]" onClick={() => setSelectedMessageIds(new Set(messages.map((message) => message.id)))}>
                  Selecionar todas
                </Button>
              </div>
            )}
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
                          onTouchStart={() => message.external_id && startReactionPress(message.id)}
                          onTouchEnd={cancelReactionPress}
                          onTouchCancel={cancelReactionPress}
                          onTouchMove={cancelReactionPress}
                          className={`group relative max-w-[78%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${message.direction === "outbound" ? "rounded-br-sm bg-[#d9fdd3] text-[#26342a]" : "rounded-bl-sm bg-white text-[#2e2b28]"} ${reactionTargetId === message.id ? "ring-2 ring-[#3c9b65]" : ""}`}
                        >
                          {messageSelectionMode && (
                            <button
                              type="button"
                              className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-xs shadow ${message.direction === "outbound" ? "-left-6" : "-right-6"} ${selectedMessageIds.has(message.id) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}
                              onClick={() => setSelectedMessageIds((current) => {
                                const next = new Set(current);
                                if (next.has(message.id)) next.delete(message.id);
                                else next.add(message.id);
                                return next;
                              })}
                              aria-label={`${selectedMessageIds.has(message.id) ? "Desselecionar" : "Selecionar"} mensagem`}
                              aria-pressed={selectedMessageIds.has(message.id)}
                            >
                              {selectedMessageIds.has(message.id) ? "✓" : ""}
                            </button>
                          )}
                          {message.external_id && (
                            <button
                              type="button"
                              className="inbox-reaction-trigger absolute -top-2 right-1 h-7 w-7 items-center justify-center rounded-full border bg-white/95 text-[#60716a] shadow-sm transition"
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
                          {message.ai_responded && (
                            <Badge
                              className="mb-1.5 border border-[#e7a9a9] bg-[#f7dada] px-2 py-0.5 text-[10px] font-semibold text-[#7d3030] shadow-none"
                            >
                              IA a responder
                            </Badge>
                          )}
                          {message.media_url && message.kind === "image" && (
                            <div className="mb-1">
                              {mediaStatus.loading && <div className="mb-2 rounded bg-[#f4f6f2] px-2 py-1 text-[10px] text-[#5d6d61]">Carregando imagem...</div>}
                              {!mediaStatus.error ? (
                                <button
                                  type="button"
                                  className="block cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  aria-label="Ampliar imagem"
                                  onClick={() => setPreviewMedia({ url: message.media_url!, alt: "Imagem da conversa" })}
                                >
                                  <img
                                    src={`${message.media_url}${message.media_url.includes("?") ? "&" : "?"}v=${mediaRetryKey}`}
                                    alt="Imagem da conversa"
                                    loading="lazy"
                                    className="max-h-72 max-w-[320px] rounded object-cover"
                                    onLoad={() => setMediaStateMap((current) => ({ ...current, [message.id]: { loading: false, error: false } }))}
                                    onError={() => setMediaStateMap((current) => ({ ...current, [message.id]: { loading: false, error: true } }))}
                                  />
                                </button>
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
                      onChange={(event) => {
                        setMediaFile(event.target.files?.[0] || null);
                        setRecordedVoiceNote(false);
                        event.currentTarget.value = "";
                      }}
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
                      onClick={() => { setMediaFile(null); setRecordedVoiceNote(false); }}
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
        <Fragment>
        <Dialog open={forwardOpen} onOpenChange={(open) => {
          setForwardOpen(open);
          if (!open && !bulkActionBusy) {
            setForwardTargetId("");
            setForwardSearch("");
          }
        }}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Reencaminhar mensagens</DialogTitle>
              <DialogDescription>Escolha um contacto para enviar as {selectedMessageIds.size} mensagens selecionadas.</DialogDescription>
            </DialogHeader>
            <Input value={forwardSearch} onChange={(event) => setForwardSearch(event.target.value)} placeholder="Pesquisar contacto ou número" aria-label="Pesquisar contacto de destino" />
            <div className="max-h-[45dvh] space-y-1 overflow-y-auto">
              {conversations
                .filter((conversation) =>
                  conversation.id !== selected?.id
                  && conversation.contact?.phone_number
                  && (!conversation.instance_name || conversation.instance_name === (selected?.instance_name || activeInstance))
                  && `${conversation.contact.name || ""} ${conversation.contact.phone_number}`.toLocaleLowerCase("pt").includes(forwardSearch.trim().toLocaleLowerCase("pt")),
                )
                .map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent ${forwardTargetId === conversation.id ? "border-primary bg-primary/5" : ""}`}
                    onClick={() => setForwardTargetId(conversation.id)}
                    aria-pressed={forwardTargetId === conversation.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{conversation.contact?.name || conversation.contact?.phone_number}</span>
                      <span className="block text-xs text-muted-foreground">{conversation.contact?.phone_number}</span>
                    </span>
                    {forwardTargetId === conversation.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                ))}
              {conversations.filter((conversation) => conversation.id !== selected?.id && conversation.contact?.phone_number).length === 0 && (
                <p className="py-5 text-center text-sm text-muted-foreground">Não há outros contactos disponíveis nesta conta de WhatsApp.</p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setForwardOpen(false)} disabled={bulkActionBusy}>Cancelar</Button>
              <Button type="button" onClick={() => void forwardSelectedMessages()} disabled={!forwardTargetId || bulkActionBusy || selectedMessageIds.size > 100}>
                {bulkActionBusy ? "A reencaminhar..." : `Reencaminhar ${selectedMessageIds.size} mensagem(ns)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
                <button
                  type="button"
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d7b98e] text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  aria-label="Ampliar foto de perfil"
                  disabled={!selected.contact?.profile_picture_url}
                  onClick={() => selected.contact?.profile_picture_url && setPreviewMedia({
                    url: selected.contact.profile_picture_url,
                    alt: `Foto de perfil de ${selected.contact.name || selected.contact.phone_number}`,
                  })}
                >
                  {selected.contact?.profile_picture_url ? <img src={selected.contact.profile_picture_url} alt="" className="h-full w-full object-cover" /> : getContactInitials(selected.contact?.name, selected.contact?.phone_number)}
                </button>
                <div>
                  <div className="text-lg font-semibold">
                    {selected.contact?.name || "Sem nome"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selected.contact?.phone_number}
                  </div>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Etiquetas da conversa</div>
                <div className="flex flex-wrap gap-2">
                  {inboxTags.map((tag) => {
                    const active = selected.contact?.tags?.some((item) => item.id === tag.id) || false;
                    return (
                      <Button
                        key={tag.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="font-semibold"
                        style={{
                          borderColor: tag.color,
                          backgroundColor: active ? tag.color : undefined,
                          color: active ? getCategoryTextColor(tag.color) : undefined,
                        }}
                        onClick={() => void toggleConversationTag(tag)}
                      >
                        {tag.name}
                      </Button>
                    );
                  })}
                  {!inboxTags.length && <span className="text-xs text-muted-foreground">Crie etiquetas no segmentador para as atribuir.</span>}
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
                    setQuickForm({
                      service: "",
                      item: "",
                      scheduled_at: "",
                      notes: "",
                      customer_name: selected.contact?.name || "",
                      customer_phone: selected.contact?.phone_number || "",
                      location: "",
                      price: "",
                      quantity: "1",
                      delivery_fee: "0",
                      discount: "0",
                    });
                    setQuickAction("order");
                    setProfileOpen(false);
                  }}
                >
                  Criar pedido
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuickForm({
                      service: "",
                      item: "",
                      scheduled_at: "",
                      notes: "",
                      customer_name: selected.contact?.name || "",
                      customer_phone: selected.contact?.phone_number || "",
                      location: "",
                      price: "",
                      quantity: "1",
                      delivery_fee: "0",
                      discount: "0",
                    });
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
        </Fragment>
      )}
      <Dialog open={Boolean(previewMedia)} onOpenChange={(open) => !open && setPreviewMedia(null)}>
        <DialogContent className="flex h-[min(90vh,900px)] max-w-[min(95vw,1100px)] flex-col border-0 bg-black/95 p-3 sm:p-5">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-white">{previewMedia?.alt || "Imagem"}</DialogTitle>
          </DialogHeader>
          {previewMedia && (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <img src={previewMedia.url} alt={previewMedia.alt} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={tagManagerOpen} onOpenChange={setTagManagerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Etiquetas do segmentador</DialogTitle>
            <DialogDescription>Crie categorias, escolha as cores e use-as para filtrar conversas.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Nome da nova etiqueta"
              placeholder="Nome da etiqueta"
              value={newTag.name}
              onChange={(event) => setNewTag((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Enter") void createInboxTag(); }}
            />
            <Input
              aria-label="Cor da nova etiqueta"
              className="h-10 w-12 shrink-0 p-1"
              type="color"
              value={newTag.color}
              onChange={(event) => setNewTag((current) => ({ ...current, color: event.target.value }))}
            />
            <Button disabled={savingTag || !newTag.name.trim()} onClick={() => void createInboxTag()}>
              {savingTag ? "A guardar..." : "Adicionar"}
            </Button>
          </div>
          <div className="space-y-2">
            {inboxTags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2 rounded-md border p-2">
                <Input
                  aria-label={`Nome: ${tag.name}`}
                  className="h-9"
                  defaultValue={tag.name}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim();
                    if (name && name !== tag.name) void updateInboxTag(tag, { name });
                    else if (!name) event.currentTarget.value = tag.name;
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                />
                <Input
                  aria-label={`Cor: ${tag.name}`}
                  className="h-9 w-12 shrink-0 p-1"
                  type="color"
                  defaultValue={tag.color}
                  onBlur={(event) => {
                    if (event.currentTarget.value !== tag.color) {
                      void updateInboxTag(tag, { color: event.currentTarget.value });
                    }
                  }}
                />
                <Badge className="max-w-28 truncate font-semibold" style={{ backgroundColor: tag.color, color: getCategoryTextColor(tag.color) }}>{tag.name}</Badge>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deleteInboxTag(tag)}>Eliminar</Button>
              </div>
            ))}
            {!inboxTags.length && <p className="py-2 text-sm text-muted-foreground">Ainda não existem etiquetas.</p>}
          </div>
        </DialogContent>
      </Dialog>
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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
              <>
                <Input
                  placeholder="Nome do cliente"
                  value={quickForm.customer_name}
                  onChange={(event) => setQuickForm({ ...quickForm, customer_name: event.target.value })}
                  required
                />
                <Input
                  placeholder="Telefone"
                  value={quickForm.customer_phone}
                  onChange={(event) => setQuickForm({ ...quickForm, customer_phone: event.target.value })}
                  required
                />
                <Input
                  placeholder="Localização / endereço de entrega"
                  value={quickForm.location}
                  onChange={(event) => setQuickForm({ ...quickForm, location: event.target.value })}
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_110px_140px]">
                  <Input
                    placeholder="Produto ou descrição"
                    value={quickForm.item}
                    onChange={(event) => setQuickForm({ ...quickForm, item: event.target.value })}
                    required
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Quantidade"
                    value={quickForm.quantity}
                    onChange={(event) => setQuickForm({ ...quickForm, quantity: event.target.value })}
                    required
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Preço unitário (Kz)"
                    value={quickForm.price}
                    onChange={(event) => setQuickForm({ ...quickForm, price: event.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Taxa de entrega (Kz)"
                    value={quickForm.delivery_fee}
                    onChange={(event) => setQuickForm({ ...quickForm, delivery_fee: event.target.value })}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Desconto (Kz)"
                    value={quickForm.discount}
                    onChange={(event) => setQuickForm({ ...quickForm, discount: event.target.value })}
                  />
                </div>
                <p className="text-sm font-medium">
                  Total: {Math.max(0, (Number(quickForm.price) || 0) * (Number(quickForm.quantity) || 0) + (Number(quickForm.delivery_fee) || 0) - (Number(quickForm.discount) || 0)).toLocaleString("pt-AO")} Kz
                </p>
              </>
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
