import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Plus, QrCode, Trash2, Download, ExternalLink, Pencil, ChevronUp, ChevronDown } from "lucide-react";

type StoreRow = { id: string; name: string; slug: string; logo_url: string | null; logo_size?: number; hide_store_name?: boolean; theme_color: string | null; header_color: string | null; checkout_whatsapp: string | null; description: string | null; custom_domain?: string | null; custom_domain_verified?: boolean; seo_title?: string | null; seo_description?: string | null; seo_keywords?: string | null };
type Slide = { id: string; title: string | null; subtitle: string | null; image_url: string | null; bg_color: string | null; link_url: string | null; position: number };

const COLORS = [
  "#16a34a", "#0ea5e9", "#dc2626", "#f97316", "#eab308",
  "#7c3aed", "#ec4899", "#0f172a", "#475569", "#059669",
  "#2563eb", "#be123c",
];

export default function StoreManagement() {
  const { user } = useAuth(); const { toast } = useToast();
  const [store, setStore] = useState<StoreRow | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [form, setForm] = useState({ name: "", logo_url: "", logo_size: 64, hide_store_name: false, theme_color: "#16a34a", header_color: "#16a34a", checkout_whatsapp: "", description: "", custom_domain: "", seo_title: "", seo_description: "", seo_keywords: "" });
  const [planName, setPlanName] = useState("Muwoyo Start");
  const [qrOpen, setQrOpen] = useState(false);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [slideForm, setSlideForm] = useState({ title: "", subtitle: "", image_url: "", bg_color: "#16a34a", link_url: "" });

  const storeUrl = useMemo(() => (store?.slug ? `${window.location.origin}/loja/${store.slug}` : ""), [store?.slug]);

  const load = async () => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("plan_id").eq("user_id", user.id).maybeSingle();
    if (profile?.plan_id) { const { data: plan } = await supabase.from("subscription_plans").select("name").eq("id", profile.plan_id).maybeSingle(); setPlanName(plan?.name || "Muwoyo Start"); }
    let { data: s } = await supabase.from("stores").select("id,name,slug,logo_url,logo_size,hide_store_name,theme_color,header_color,checkout_whatsapp,description,custom_domain,custom_domain_verified,seo_title,seo_description,seo_keywords").eq("user_id", user.id).maybeSingle();
    if (!s) {
      const slug = `loja-${user.id.slice(0, 8)}`;
      const created = await supabase.from("stores").insert({ user_id: user.id, name: "Minha Loja", slug, is_active: true }).select().single();
      s = created.data as any;
    }
    setStore(s as any);
    if (s) { const store = s as StoreRow; setForm({ name: store.name || "", logo_url: store.logo_url || "", logo_size: store.logo_size || 64, hide_store_name: Boolean(store.hide_store_name), theme_color: store.theme_color || "#16a34a", header_color: store.header_color || "#16a34a", checkout_whatsapp: store.checkout_whatsapp || "", description: store.description || "", custom_domain: store.custom_domain || "", seo_title: store.seo_title || "", seo_description: store.seo_description || "", seo_keywords: store.seo_keywords || "" }); }
    if (s) {
      const { data } = await supabase.from("store_carousel_slides").select("*").eq("store_id", (s as any).id).order("position");
      setSlides((data as any) || []);
    }
  };
  useEffect(() => { load(); }, [user]);

  const uploadImage = async (file: File, folder = "store") => {
    if (!user) return null;
    const path = `${user.id}/${folder}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return null; }
    return supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
  };

  const saveStore = async (e: FormEvent) => {
    e.preventDefault(); if (!user || !store) return;
    const { error } = await supabase.from("stores").update(form).eq("id", store.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Loja atualizada" }); load();
  };

  const addSlide = async (e: FormEvent) => {
    e.preventDefault(); if (!user || !store) return;
    const { error } = editingSlide
      ? await supabase.from("store_carousel_slides").update(slideForm).eq("id", editingSlide.id).eq("user_id", user.id)
      : await supabase.from("store_carousel_slides").insert({
        store_id: store.id, user_id: user.id, ...slideForm, position: slides.length,
      });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setSlideForm({ title: "", subtitle: "", image_url: "", bg_color: "#16a34a", link_url: "" });
    setEditingSlide(null);
    setSlideOpen(false); load();
  };

  const removeSlide = async (id: string) => {
    if (!confirm("Eliminar este slide?")) return;
    const { error } = await supabase.from("store_carousel_slides").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  const moveSlide = async (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= slides.length) return;
    const currentSlide = slides[index];
    const targetSlide = slides[target];
    const { error } = await Promise.all([
      supabase.from("store_carousel_slides").update({ position: targetSlide.position }).eq("id", currentSlide.id),
      supabase.from("store_carousel_slides").update({ position: currentSlide.position }).eq("id", targetSlide.id),
    ]).then((results) => ({ error: results.find((result) => result.error)?.error || null }));
    if (error) return toast({ title: "Não foi possível reordenar", description: error.message, variant: "destructive" });
    await load();
  };

  const editSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setSlideForm({
      title: slide.title || "",
      subtitle: slide.subtitle || "",
      image_url: slide.image_url || "",
      bg_color: slide.bg_color || "#16a34a",
      link_url: slide.link_url || "",
    });
    setSlideOpen(true);
  };

  const downloadQR = () => {
    const canvas = document.querySelector("#store-qr canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a"); a.href = url; a.download = `${store?.slug || "loja"}-qr.png`; a.click();
  };

  return (
    <DashboardShell title="Minha Loja" description="Configure a aparência, carrossel e link público da sua loja.">
      <Card><CardHeader><CardTitle>Configuração da loja</CardTitle></CardHeader><CardContent>
        <form onSubmit={saveStore} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Nome da loja</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>WhatsApp para checkout</Label><Input value={form.checkout_whatsapp} onChange={(e) => setForm({ ...form, checkout_whatsapp: e.target.value.replace(/\D/g, "") })} placeholder="244928663898" /></div>
          <div className="space-y-2">
            <Label>Logo da loja</Label>
            <Input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setForm({ ...form, logo_url: (await uploadImage(f, "logos")) || "" }); }} />
            {form.logo_url && <img src={form.logo_url} alt="" className="mt-2 object-contain" style={{ height: form.logo_size, maxWidth: form.hide_store_name ? 320 : form.logo_size * 2 }} />}
            <Label htmlFor="store-logo-size">Tamanho da logo: {form.logo_size}px</Label>
            <input id="store-logo-size" type="range" min="32" max="160" step="4" value={form.logo_size} onChange={(e) => setForm({ ...form, logo_size: Number(e.target.value) })} className="w-full accent-primary" />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.hide_store_name} disabled={!form.logo_url} onChange={(e) => setForm({ ...form, hide_store_name: e.target.checked })} className="mt-0.5" />
              <span>Ocultar o nome e usar a logo retangular como marca principal</span>
            </label>
            {!form.logo_url && <p className="text-xs text-muted-foreground">Carregue uma logo para poder ocultar o nome da loja.</p>}
          </div>
          <div className="space-y-2 md:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-3 md:col-span-2 rounded-md border p-4"><Label>Domínio personalizado</Label><Input disabled={!['Muwoyo Big', 'Enterprise'].includes(planName)} value={form.custom_domain} onChange={(e) => setForm({ ...form, custom_domain: e.target.value.toLowerCase().trim() })} placeholder="www.minhaempresa.ao" />{['Muwoyo Big', 'Enterprise'].includes(planName) ? <p className="text-xs text-muted-foreground">Aponte o seu domínio para `stores.muwoyo.com` e aguarde a verificação DNS. Estado: {store?.custom_domain_verified ? "verificado" : "aguardando verificação"}.</p> : <p className="text-xs text-muted-foreground">Disponível nos planos Muwoyo Big e Enterprise.</p>}</div>
          <div className="space-y-3 md:col-span-2 rounded-md border p-4"><Label>SEO da loja</Label><Input disabled={!['Muwoyo Big', 'Enterprise'].includes(planName)} value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} placeholder="Título para motores de busca" /><Textarea disabled={!['Muwoyo Big', 'Enterprise'].includes(planName)} value={form.seo_description} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} placeholder="Descrição da loja para motores de busca" /><Input disabled={!['Muwoyo Big', 'Enterprise'].includes(planName)} value={form.seo_keywords} onChange={(e) => setForm({ ...form, seo_keywords: e.target.value })} placeholder="Palavras-chave separadas por vírgula" />{!['Muwoyo Big', 'Enterprise'].includes(planName) && <p className="text-xs text-muted-foreground">SEO avançado está disponível nos planos Muwoyo Big e Enterprise.</p>}</div>
          <div className="space-y-2 md:col-span-2">
            <Label>Cor do header (onde fica a logo)</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, header_color: c })}
                  className={`h-9 w-9 rounded-full ${form.header_color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Cor principal (botões e preços)</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, theme_color: c })}
                  className={`h-9 w-9 rounded-full ${form.theme_color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <Button className="w-fit md:col-span-2">Guardar loja</Button>
        </form>
      </CardContent></Card>

      <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="font-semibold">Link público da loja</div>
          <div className="truncate text-sm text-muted-foreground">{storeUrl}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link to={`/loja/${store?.slug || ""}`} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Ver loja</Link></Button>
          <Button variant="outline" onClick={() => setQrOpen(true)}><QrCode className="mr-2 h-4 w-4" />Ver QR Code</Button>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle>Carrossel da loja</CardTitle><p className="text-xs text-muted-foreground">Promoções e destaques que aparecem no topo da loja.</p></div>
          <Button size="sm" onClick={() => { setEditingSlide(null); setSlideForm({ title: "", subtitle: "", image_url: "", bg_color: "#16a34a", link_url: "" }); setSlideOpen(true); }}><Plus className="mr-2 h-4 w-4" />Novo slide</Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((s, index) => (
              <div key={s.id} className="relative overflow-hidden rounded-lg border" style={{ backgroundColor: s.bg_color || "#16a34a" }}>
                <div className="relative h-36">
                  {s.image_url ? <img src={s.image_url} alt={s.title || "Slide da loja"} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-4 text-center text-white"><div><div className="font-bold">{s.title}</div><div className="text-xs">{s.subtitle}</div></div></div>}
                  {s.image_url && (s.title || s.subtitle) && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-white"><div className="line-clamp-1 font-bold">{s.title}</div><div className="line-clamp-1 text-xs">{s.subtitle}</div></div>}
                  <div className="absolute right-2 top-2 flex gap-1">
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7" disabled={index === 0} onClick={() => void moveSlide(index, -1)} aria-label="Mover slide para cima"><ChevronUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7" disabled={index === slides.length - 1} onClick={() => void moveSlide(index, 1)} aria-label="Mover slide para baixo"><ChevronDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7" onClick={() => editSlide(s)} aria-label="Editar slide"><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => void removeSlide(s.id)} aria-label="Eliminar slide"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
            {slides.length === 0 && <div className="col-span-full py-8 text-center text-sm text-muted-foreground">Sem slides. Crie o primeiro para destacar uma promoção.</div>}
          </div>
        </CardContent>
      </Card>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Code da loja</DialogTitle></DialogHeader>
          <div id="store-qr" className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-lg bg-white p-4"><QRCodeCanvas value={storeUrl || "https://muwoyo.com"} size={220} /></div>
            <p className="text-center text-xs text-muted-foreground break-all">{storeUrl}</p>
            <Button onClick={downloadQR} className="w-full"><Download className="mr-2 h-4 w-4" />Baixar QR Code</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slide dialog */}
      <Dialog open={slideOpen} onOpenChange={setSlideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingSlide ? "Editar slide" : "Novo slide"}</DialogTitle></DialogHeader>
          <form onSubmit={addSlide} className="space-y-3">
            <div className="space-y-1.5"><Label>Título</Label><Input required value={slideForm.title} onChange={(e) => setSlideForm({ ...slideForm, title: e.target.value })} placeholder="Ex: Promoção da semana" /></div>
            <div className="space-y-1.5"><Label>Subtítulo</Label><Input value={slideForm.subtitle} onChange={(e) => setSlideForm({ ...slideForm, subtitle: e.target.value })} placeholder="Ex: 30% off em todos os produtos" /></div>
            <div className="space-y-1.5"><Label>Imagem de destaque (opcional)</Label><Input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setSlideForm({ ...slideForm, image_url: (await uploadImage(f, "slides")) || "" }); }} />{slideForm.image_url && <img src={slideForm.image_url} alt="" className="mt-2 h-28 w-full rounded object-cover" />}</div>
            <div className="space-y-1.5">
              <Label>Cor de fundo</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setSlideForm({ ...slideForm, bg_color: c })}
                    className={`h-8 w-8 rounded-full ${slideForm.bg_color === c ? "ring-2 ring-foreground ring-offset-2" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button className="w-full">{editingSlide ? "Guardar slide" : "Adicionar slide"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
