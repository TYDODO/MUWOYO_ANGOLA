import { FormEvent, useCallback, useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Pencil, Plus, Trash2, Video } from "lucide-react";

type ProofType = "product" | "service";
type Product = { id: string; name: string };
type SocialProof = {
  id: string;
  proof_type: ProofType;
  product_id: string | null;
  title: string;
  description: string;
  media_url: string | null;
  is_active: boolean;
};

const emptyForm = {
  proof_type: "product" as ProofType,
  product_id: "",
  title: "",
  description: "",
  media_url: "",
};

function getMediaKind(url: string): "image" | "video" | null {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return "video";
    if (/\.(png|jpe?g|gif|webp|avif)$/.test(path)) return "image";
  } catch {
    return null;
  }
  return null;
}

export default function SocialProofs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [proofs, setProofs] = useState<SocialProof[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: productRows, error: productsError }, { data: proofRows, error: proofsError }] = await Promise.all([
      supabase.from("products").select("id,name").eq("user_id", user.id).order("name"),
      supabase.from("social_proofs").select("id,proof_type,product_id,title,description,media_url,is_active").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (productsError || proofsError) {
      toast({ title: "Erro ao carregar provas sociais", description: productsError?.message || proofsError?.message, variant: "destructive" });
      return;
    }
    setProducts((productRows || []) as Product[]);
    setProofs((proofRows || []) as SocialProof[]);
  }, [toast, user]);

  useEffect(() => { void load(); }, [load]);

  const uploadMedia = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({ title: "Ficheiro não suportado", description: "Escolha uma imagem ou um vídeo.", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Ficheiro demasiado grande", description: "O tamanho máximo é 50 MB.", variant: "destructive" });
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "media";
    const path = `${user.id}/social-proofs/${crypto.randomUUID()}.${extension}`;
    setUploadingMedia(true);
    const { error } = await supabase.storage.from("store-assets").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    setUploadingMedia(false);
    if (error) {
      toast({ title: "Não foi possível carregar a mídia", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
    setForm((current) => ({ ...current, media_url: data.publicUrl }));
    setMediaKind(file.type.startsWith("video/") ? "video" : "image");
    toast({ title: "Mídia carregada" });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (form.proof_type === "product" && !form.product_id) {
      toast({ title: "Produto obrigatório", description: "Associe esta prova social a um produto." , variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      proof_type: form.proof_type,
      product_id: form.proof_type === "product" ? form.product_id : null,
      title: form.title.trim(),
      description: form.description.trim(),
      media_url: form.media_url.trim() || null,
    };
    const result = editingId
      ? await supabase.from("social_proofs").update(payload).eq("id", editingId).eq("user_id", user.id)
      : await supabase.from("social_proofs").insert(payload);
    setSaving(false);
    if (result.error) {
      toast({ title: "Erro ao guardar", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Prova social atualizada" : "Prova social adicionada" });
    setForm(emptyForm);
    setEditingId(null);
    setMediaKind(null);
    await load();
  };

  const edit = (proof: SocialProof) => {
    setEditingId(proof.id);
    setForm({
      proof_type: proof.proof_type,
      product_id: proof.product_id || "",
      title: proof.title,
      description: proof.description,
      media_url: proof.media_url || "",
    });
    setMediaKind(proof.media_url ? getMediaKind(proof.media_url) : null);
  };

  const setActive = async (proof: SocialProof) => {
    const { error } = await supabase.from("social_proofs").update({ is_active: !proof.is_active }).eq("id", proof.id).eq("user_id", user?.id || "");
    if (error) return toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    await load();
  };

  const remove = async (proof: SocialProof) => {
    if (!window.confirm("Eliminar esta prova social?")) return;
    const { error } = await supabase.from("social_proofs").delete().eq("id", proof.id).eq("user_id", user?.id || "");
    if (error) return toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    await load();
  };

  return (
    <DashboardShell title="Provas sociais" description="Organize testemunhos por produto ou serviço.">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={save} className="grid gap-4">
            <fieldset className="space-y-2">
              <Label htmlFor="proof-type">Esta prova social é sobre:</Label>
              <select
                id="proof-type"
                required
                value={form.proof_type}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  proof_type: event.target.value as ProofType,
                  product_id: event.target.value === "service" ? "" : current.product_id,
                }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="product">Produto</option>
                <option value="service">Serviço</option>
              </select>
            </fieldset>

            {form.proof_type === "product" ? (
              <div className="space-y-2">
                <Label htmlFor="proof-product">Produto associado</Label>
                <select
                  id="proof-product"
                  required
                  value={form.product_id}
                  onChange={(event) => setForm((current) => ({ ...current, product_id: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecione um produto</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                {products.length === 0 && <p className="text-xs text-muted-foreground">Cadastre um produto antes de criar este testemunho.</p>}
              </div>
            ) : (
              <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                Este testemunho será utilizado como prova social geral da empresa ou dos seus serviços.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="proof-title">Título</Label>
              <Input id="proof-title" required maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof-description">Descrição</Label>
              <Textarea id="proof-description" required maxLength={4000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof-media">Link ou mídia do testemunho (opcional)</Label>
              <Input id="proof-media" type="url" value={form.media_url} onChange={(event) => {
                setForm((current) => ({ ...current, media_url: event.target.value }));
                setMediaKind(getMediaKind(event.target.value));
              }} placeholder="https://..." />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                {mediaKind === "video" ? <Video className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                {uploadingMedia ? "A carregar mídia..." : "Carregar imagem ou vídeo"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="sr-only"
                  disabled={uploadingMedia}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadMedia(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">Imagens ou vídeos até 50 MB. O carregamento substitui o link atual.</p>
              {form.media_url && mediaKind === "image" && <img src={form.media_url} alt="Pré-visualização da prova social" className="max-h-56 rounded-md border object-contain" />}
              {form.media_url && mediaKind === "video" && <video src={form.media_url} controls className="max-h-56 w-full rounded-md border" />}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || uploadingMedia || (form.proof_type === "product" && products.length === 0)}>
                <Plus className="mr-2 h-4 w-4" />{saving ? "A guardar..." : editingId ? "Guardar alterações" : "Adicionar prova social"}
              </Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); setMediaKind(null); }}>Cancelar</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="mt-6 space-y-3" aria-label="Provas sociais cadastradas">
        {proofs.map((proof) => (
          <Card key={proof.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{proof.title}</h2>
                  <Badge variant={proof.is_active ? "default" : "secondary"}>{proof.is_active ? "Ativa" : "Inativa"}</Badge>
                  <Badge variant="outline">{proof.proof_type === "product" ? products.find((product) => product.id === proof.product_id)?.name || "Produto" : "Serviço"}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{proof.description}</p>
                {proof.media_url && getMediaKind(proof.media_url) === "image" && <img src={proof.media_url} alt={`Mídia de ${proof.title}`} className="max-h-56 rounded-md border object-contain" />}
                {proof.media_url && getMediaKind(proof.media_url) === "video" && <video src={proof.media_url} controls className="max-h-56 w-full rounded-md border" />}
                {proof.media_url && !getMediaKind(proof.media_url) && <a className="text-sm text-primary underline" href={proof.media_url} target="_blank" rel="noreferrer">Abrir testemunho</a>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="icon" variant="outline" title="Editar" onClick={() => edit(proof)}><Pencil className="h-4 w-4" /></Button>
                <Button type="button" variant="outline" onClick={() => void setActive(proof)}>{proof.is_active ? "Desativar" : "Ativar"}</Button>
                <Button type="button" size="icon" variant="ghost" title="Eliminar" onClick={() => void remove(proof)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {proofs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ainda não há provas sociais cadastradas.</p>}
      </section>
    </DashboardShell>
  );
}