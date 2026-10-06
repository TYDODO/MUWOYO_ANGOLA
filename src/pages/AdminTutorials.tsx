import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Video } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type TutorialVideo = {
  id: string;
  title: string;
  description: string | null;
  subtitle: string | null;
  video_url: string;
  cover_url: string | null;
  position: number;
  is_published: boolean;
};

type Form = Omit<TutorialVideo, "id">;
const emptyForm: Form = { title: "", subtitle: "", description: "", video_url: "", cover_url: "", position: 0, is_published: true };
const sb = supabase as any;

export default function AdminTutorials() {
  const { toast } = useToast();
  const [videos, setVideos] = useState<TutorialVideo[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TutorialVideo | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await sb.from("tutorial_videos").select("id,title,subtitle,description,video_url,cover_url,position,is_published").order("position").order("created_at");
    if (error) toast({ title: "Não foi possível carregar os tutoriais", description: error.message, variant: "destructive" });
    setVideos((data || []) as TutorialVideo[]);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, position: videos.length });
    setOpen(true);
  };

  const startEdit = (video: TutorialVideo) => {
    setEditing(video);
    setForm({ title: video.title, subtitle: video.subtitle || "", description: video.description || "", video_url: video.video_url, cover_url: video.cover_url || "", position: video.position, is_published: video.is_published });
    setOpen(true);
  };

  const uploadMedia = async (file: File, field: "video_url" | "cover_url") => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `tutorials/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("tutorial-media").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) {
      toast({ title: "Upload não concluído", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("tutorial-media").getPublicUrl(path);
    setForm((current) => ({ ...current, [field]: data.publicUrl }));
    toast({ title: field === "video_url" ? "Vídeo carregado" : "Capa carregada" });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.video_url.trim()) return;
    setSaving(true);
    const query = editing
      ? sb.from("tutorial_videos").update(form).eq("id", editing.id)
      : sb.from("tutorial_videos").insert(form);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Tutorial atualizado" : "Tutorial adicionado" });
    setOpen(false);
    load();
  };

  const remove = async (video: TutorialVideo) => {
    if (!window.confirm(`Remover o tutorial "${video.title}"?`)) return;
    const { error } = await sb.from("tutorial_videos").delete().eq("id", video.id);
    if (error) return toast({ title: "Não foi possível remover", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <AdminShell mode="admin" title="Tutoriais">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Organize vídeos que os clientes podem assistir dentro da Muwoyo.</p>
        </div>
        <Button onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Adicionar vídeo</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {videos.map((video) => (
          <Card key={video.id} className="overflow-hidden border-border/60 shadow-sm">
            <div className="aspect-video bg-muted">{video.cover_url ? <img src={video.cover_url} alt={`Capa de ${video.title}`} className="h-full w-full object-cover" /> : <iframe className="h-full w-full" src={video.video_url} title={video.title} allowFullScreen />}</div>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div><CardTitle className="text-lg">{video.title}</CardTitle>{video.subtitle && <p className="mt-1 text-sm text-muted-foreground">{video.subtitle}</p>}<p className="mt-1 text-xs text-muted-foreground">{video.is_published ? "Publicado" : "Rascunho"} · posição {video.position + 1}</p></div>
              <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" onClick={() => startEdit(video)} aria-label="Editar tutorial"><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => remove(video)} aria-label="Remover tutorial"><Trash2 className="h-4 w-4" /></Button></div>
            </CardHeader>
            {video.description && <CardContent className="pt-0 text-sm text-muted-foreground">{video.description}</CardContent>}
          </Card>
        ))}
        {!videos.length && <Card className="lg:col-span-2"><CardContent className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground"><Video className="h-8 w-8" /><p>Ainda não há vídeos cadastrados.</p></CardContent></Card>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar vídeo" : "Adicionar vídeo"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-2"><Label htmlFor="tutorial-title">Título</Label><Input id="tutorial-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="tutorial-subtitle">Subtítulo</Label><Input id="tutorial-subtitle" value={form.subtitle || ""} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="tutorial-url">Vídeo</Label><div className="flex gap-2"><Input id="tutorial-url" required placeholder="URL ou upload de vídeo" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} /><label className="inline-flex shrink-0 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-accent">Carregar<input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "video_url")} /></label></div></div>
            <div className="space-y-2"><Label htmlFor="tutorial-cover">Capa</Label><div className="flex gap-2"><Input id="tutorial-cover" placeholder="URL ou upload de imagem" value={form.cover_url || ""} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} /><label className="inline-flex shrink-0 cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-accent">Carregar<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], "cover_url")} /></label></div></div>
            <div className="space-y-2"><Label htmlFor="tutorial-description">Descrição</Label><Textarea id="tutorial-description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="tutorial-position">Posição</Label><Input id="tutorial-position" type="number" min="0" value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} /></div><label className="flex items-center gap-3 pt-7 text-sm"><Switch checked={form.is_published} onCheckedChange={(checked) => setForm({ ...form, is_published: checked })} />Publicado</label></div>
            <Button className="w-full" disabled={saving}>{saving ? "A guardar..." : "Guardar vídeo"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
