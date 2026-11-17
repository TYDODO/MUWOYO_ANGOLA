<<<<<<< HEAD
import { useEffect, useMemo, useRef, useState } from "react";
=======
import { useEffect, useMemo, useState } from "react";
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
<<<<<<< HEAD
import { ShoppingCart, Plus, Minus, Trash2, Star, Send, Search, ListFilter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
=======
import { ShoppingCart, Plus, Minus, Trash2, Star, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e

type StoreRow = {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  checkout_whatsapp: string | null;
  description: string | null;
  theme_color: string | null;
  header_color: string | null;
<<<<<<< HEAD
  logo_size?: number | null;
  hide_store_name?: boolean | null;
};
type ProductMedia = { url: string; media_type: "image" | "video"; color: string | null; size: string | null; position: number };
=======
};
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null;
  image_url: string | null;
  image_urls?: string[];
<<<<<<< HEAD
  media_items?: ProductMedia[];
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  stock: number | null;
  is_sold_out: boolean;
  category_ids: string[] | null;
  rating_avg: number;
  rating_count: number;
<<<<<<< HEAD
  created_at?: string;
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
};
type Category = { id: string; name: string };
type Slide = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  bg_color: string | null;
};
type Review = {
  id: string;
  reviewer_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};
type CartItem = Product & { qty: number };

function Stars({
  value,
  size = 14,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            style={{ width: size, height: size }}
            className={
              i <= value
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-muted-foreground"
            }
          />
        </button>
      ))}
    </div>
  );
}

export default function PublicStore() {
  const { slug } = useParams();
  const { toast } = useToast();
  const [store, setStore] = useState<StoreRow | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
<<<<<<< HEAD
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState("featured");
  const [availability, setAvailability] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [openP, setOpenP] = useState<Product | null>(null);
  const [detailMediaIndex, setDetailMediaIndex] = useState(0);
  const detailMediaRef = useRef<HTMLDivElement>(null);
=======
  const [cart, setCart] = useState<CartItem[]>([]);
  const [openP, setOpenP] = useState<Product | null>(null);
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewForm, setReviewForm] = useState({
    name: "",
    rating: 5,
    comment: "",
  });
  const [slideIdx, setSlideIdx] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("stores")
        .select(
<<<<<<< HEAD
          "id,user_id,name,logo_url,logo_size,hide_store_name,checkout_whatsapp,description,theme_color,header_color",
=======
          "id,user_id,name,logo_url,checkout_whatsapp,description,theme_color,header_color",
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
        )
        .eq("slug", slug || "")
        .eq("is_active", true)
        .maybeSingle();
      setStore(s as any);
      if (s) {
        const sid = (s as any).id;
        const uid = (s as any).user_id;
        const [p, c, sl, pi] = await Promise.all([
          supabase
            .from("products")
            .select(
<<<<<<< HEAD
              "id,name,description,price,discount_price,image_url,stock,is_sold_out,category_ids,rating_avg,rating_count,created_at",
=======
              "id,name,description,price,discount_price,image_url,stock,is_sold_out,category_ids,rating_avg,rating_count",
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            )
            .eq("store_id", sid)
            .eq("is_active", true),
          supabase
            .from("categories")
            .select("id,name")
            .eq("user_id", uid)
            .order("name"),
          supabase
            .from("store_carousel_slides")
            .select("id,title,subtitle,image_url,bg_color")
            .eq("store_id", sid)
            .order("position"),
<<<<<<< HEAD
          supabase.from("product_images").select("product_id,url,position,media_type,color,size").order("position"),
        ]);
        const productImages = (pi.data as Array<{ product_id: string; url: string; position: number; media_type?: string | null; color?: string | null; size?: string | null }> | null) || [];
        setProducts(((p.data as Product[]) || []).map((product) => {
          const mediaItems = productImages.filter((media) => media.product_id === product.id).map((media) => ({
            url: media.url,
            position: media.position,
            media_type: media.media_type === "video" ? "video" as const : "image" as const,
            color: media.color || null,
            size: media.size || null,
          }));
          const fallback = product.image_url ? [{ url: product.image_url, position: 0, media_type: "image" as const, color: null, size: null }] : [];
          const assets = mediaItems.length ? mediaItems : fallback;
          return { ...product, media_items: assets, image_urls: assets.filter((media) => media.media_type === "image").map((media) => media.url) };
        }));
=======
          supabase.from("product_images").select("product_id,url,position").order("position"),
        ]);
        const productImages = (pi.data as Array<{ product_id: string; url: string }> | null) || [];
        setProducts(((p.data as Product[]) || []).map((product) => ({ ...product, image_urls: productImages.filter((image) => image.product_id === product.id).map((image) => image.url) })));
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
        setCategories((c.data as any) || []);
        setSlides((sl.data as any) || []);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  // auto carousel
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(
      () => setSlideIdx((i) => (i + 1) % slides.length),
      4500,
    );
    return () => clearInterval(id);
  }, [slides.length]);

  const filtered = useMemo(
<<<<<<< HEAD
    () => {
      const term = search.trim().toLocaleLowerCase();
      const result = products.filter((product) => {
        const matchesCategory = activeCat === "all" || (product.category_ids || []).includes(activeCat);
        const matchesSearch = !term || `${product.name} ${product.description || ""}`.toLocaleLowerCase().includes(term);
        const matchesAvailability = availability === "all"
          || availability === "available" && !product.is_sold_out && Number(product.stock ?? 1) > 0
          || availability === "promotion" && Boolean(product.discount_price && Number(product.discount_price) < Number(product.price))
          || availability === "new" && Boolean(product.created_at && Date.now() - new Date(product.created_at).getTime() <= 14 * 24 * 60 * 60 * 1000);
        return matchesCategory && matchesSearch && matchesAvailability;
      });
      if (sortBy === "price_asc") result.sort((a, b) => Number(a.discount_price ?? a.price) - Number(b.discount_price ?? b.price));
      if (sortBy === "price_desc") result.sort((a, b) => Number(b.discount_price ?? b.price) - Number(a.discount_price ?? a.price));
      if (sortBy === "rating") result.sort((a, b) => Number(b.rating_avg || 0) - Number(a.rating_avg || 0));
      if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name, "pt"));
      return result;
    },
    [activeCat, availability, products, search, sortBy],
=======
    () =>
      activeCat === "all"
        ? products
        : products.filter((p) => (p.category_ids || []).includes(activeCat)),
    [activeCat, products],
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  );
  const total = useMemo(
    () =>
      cart.reduce(
        (s, i) => s + Number(i.discount_price ?? i.price ?? 0) * i.qty,
        0,
      ),
    [cart],
  );

  const add = (p: Product) => {
    if (p.is_sold_out)
      return toast({ title: "Produto esgotado", variant: "destructive" });
    setCart((c) =>
      c.some((i) => i.id === p.id)
        ? c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...c, { ...p, qty: 1 }],
    );
    toast({ title: "Adicionado ao carrinho", description: p.name });
  };
  const dec = (id: string) =>
    setCart((c) =>
      c.flatMap((i) =>
        i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i],
      ),
    );
  const remove = (id: string) => setCart((c) => c.filter((i) => i.id !== id));

  const checkout = () => {
    if (!store || cart.length === 0) return;
    const lines = cart
      .map(
        (i) =>
          `• ${i.name} x${i.qty} - ${(Number(i.discount_price ?? i.price) * i.qty).toLocaleString("pt-AO")} Kz`,
      )
      .join("\n");
    const text = `Olá ${store.name}! Quero fazer uma encomenda:\n${lines}\n\n*Total:* ${total.toLocaleString("pt-AO")} Kz`;
    window.open(
      `https://wa.me/${store.checkout_whatsapp || ""}?text=${encodeURIComponent(text)}`,
      "_blank",
    );
  };

  const openProduct = async (p: Product) => {
    setOpenP(p);
    const { data } = await supabase
      .from("product_reviews")
      .select("*")
      .eq("product_id", p.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setReviews((data as any) || []);
  };
<<<<<<< HEAD
  const moveSlide = (offset: -1 | 1) => setSlideIdx((index) => (index + offset + slides.length) % slides.length);
  const relatedProducts = openP
    ? products.filter((product) => product.id !== openP.id && (product.category_ids || []).some((id) => (openP.category_ids || []).includes(id))).slice(0, 4)
    : [];
  const detailMedia = openP
    ? openP.media_items?.length
      ? openP.media_items
      : openP.image_url
        ? [{ url: openP.image_url, media_type: "image" as const, color: null, size: null, position: 0 }]
        : []
    : [];
  const scrollDetailMedia = (index: number) => {
    const carousel = detailMediaRef.current;
    if (!carousel) return;
    carousel.scrollTo({ left: index * carousel.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    setDetailMediaIndex(0);
    detailMediaRef.current?.scrollTo({ left: 0 });
  }, [openP?.id]);
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e

  const submitReview = async () => {
    if (!openP || !reviewForm.comment.trim()) return;
    const { error } = await supabase.from("product_reviews").insert({
      product_id: openP.id,
      reviewer_name: reviewForm.name || "Anónimo",
      rating: reviewForm.rating,
      comment: reviewForm.comment,
    });
    if (error)
      return toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    toast({ title: "Obrigado pela avaliação!" });
    setReviewForm({ name: "", rating: 5, comment: "" });
    openProduct(openP);
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        A carregar…
      </div>
    );
  if (!store)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loja indisponível.
      </div>
    );

  const themed = store.theme_color || "#16a34a";
  const headerBg = store.header_color || themed;
<<<<<<< HEAD
  const setQuickFilter = (value: string) => {
    if (value === "top_rated") {
      setAvailability("all");
      setSortBy("rating");
      return;
    }
    setAvailability(value);
    if (sortBy === "rating") setSortBy("featured");
  };
  const activeQuickFilter = sortBy === "rating" && availability === "all" ? "top_rated" : availability;
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* HEADER */}
      <header
        className="sticky top-0 z-30 shadow-sm"
        style={{ backgroundColor: headerBg }}
      >
<<<<<<< HEAD
        <div className="relative mx-auto grid max-w-screen-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3 text-white lg:grid-cols-[minmax(180px,auto)_minmax(280px,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
=======
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 text-white">
          <div className="flex items-center gap-3 min-w-0">
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            {store.logo_url && (
              <img
                src={store.logo_url}
                alt={store.name}
<<<<<<< HEAD
                className="w-auto max-w-[34vw] object-contain lg:max-w-[280px]"
                style={{ height: Math.max(32, Math.min(160, store.logo_size || 64)) }}
              />
            )}
            <div className="min-w-0">
              {!store.hide_store_name && <h1 className="truncate text-lg font-bold sm:text-xl">{store.name}</h1>}
=======
                className="h-10 w-auto max-w-[80px] object-contain"
              />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-xl">
                {store.name}
              </h1>
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
              {store.description && (
                <p className="hidden truncate text-xs opacity-90 sm:block">
                  {store.description}
                </p>
              )}
            </div>
          </div>
<<<<<<< HEAD
          <div className="col-start-2 flex min-w-0 items-center justify-end gap-2 lg:col-auto">
            <Button type="button" variant="secondary" size="icon" className="lg:hidden" aria-label="Abrir pesquisa" onClick={() => setMobileSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
            <div className="hidden min-w-0 items-center justify-end gap-2 lg:flex">
              {searchOpen ? (
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar produtos..." className="border-white/30 bg-white pl-9 text-foreground placeholder:text-muted-foreground" aria-label="Pesquisar produtos" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground" aria-label="Fechar pesquisa" onClick={() => { setSearch(""); setSearchOpen(false); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" size="icon" aria-label="Abrir pesquisa" onClick={() => setSearchOpen(true)}>
                  <Search className="h-4 w-4" />
                </Button>
              )}
              <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); if (event.target.value !== "rating") setAvailability((current) => current === "top_rated" ? "all" : current); }} className="h-10 rounded-md border border-white/30 bg-white px-3 text-sm text-foreground" aria-label="Ordenar produtos">
                <option value="featured">Em destaque</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="rating">Mais avaliados</option>
                <option value="name">Nome (A–Z)</option>
              </select>
            </div>
          </div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" className="hidden gap-2 relative lg:flex">
=======
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" className="gap-2 relative">
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                <ShoppingCart className="h-4 w-4" />
                <span className="hidden sm:inline">Carrinho</span>
                {cart.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {cart.reduce((s, i) => s + i.qty, 0)}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Seu carrinho</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-4">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    O carrinho está vazio.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((i) => (
                      <div
                        key={i.id}
                        className="flex gap-3 rounded-lg border p-3"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-muted">
                          {i.image_url && (
                            <img
                              src={i.image_url}
                              alt={i.name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="line-clamp-1 text-sm font-semibold">
                            {i.name}
                          </div>
                          <div
                            className="text-sm font-bold"
                            style={{ color: themed }}
                          >
                            {(
                              Number(i.discount_price ?? i.price) * i.qty
                            ).toLocaleString("pt-AO")}{" "}
                            Kz
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => dec(i.id)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm font-semibold">
                              {i.qty}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => add(i)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-auto h-7 w-7"
                              onClick={() => remove(i.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {cart.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span
                      className="text-xl font-bold"
                      style={{ color: themed }}
                    >
                      {total.toLocaleString("pt-AO")} Kz
                    </span>
                  </div>
                  <Button
                    className="w-full text-white"
                    style={{ backgroundColor: themed }}
                    onClick={checkout}
                  >
                    <Send className="mr-2 h-4 w-4" /> Finalizar no WhatsApp
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
<<<<<<< HEAD
          {mobileSearchOpen && (
            <div className="absolute inset-0 z-20 flex items-center gap-2 px-4 lg:hidden" style={{ backgroundColor: headerBg }}>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") setMobileSearchOpen(false);
                  }}
                  placeholder="Pesquisar produtos..."
                  className="border-white/30 bg-white pl-9 text-foreground placeholder:text-muted-foreground"
                  aria-label="Pesquisar produtos"
                />
              </div>
              <Button type="button" variant="secondary" size="icon" aria-label="Fechar pesquisa" onClick={() => setMobileSearchOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 space-y-5">
=======
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 space-y-5">
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
        {/* CAROUSEL */}
        {slides.length > 0 && (
          <div className="relative overflow-hidden rounded-xl">
            <div
              className="flex transition-transform duration-700"
              style={{ transform: `translateX(-${slideIdx * 100}%)` }}
            >
              {slides.map((s) => (
<<<<<<< HEAD
                <a
                key={s.id}
                href={s.link_url || undefined}
                onClick={(event) => { if (!s.link_url) event.preventDefault(); }}
                className="relative block h-36 w-full shrink-0 overflow-hidden bg-cover bg-center sm:h-52 lg:h-64"
                style={{ backgroundColor: s.bg_color || themed }}
                >
                {s.image_url
                  ? <img src={s.image_url} alt={s.title || "Destaque da loja"} className="absolute inset-0 h-full w-full object-cover" />
                  : <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white"><span className="text-xl font-bold sm:text-3xl">{s.title}</span><span className="mt-2 text-sm sm:text-lg">{s.subtitle}</span></div>}
                {s.image_url && (s.title || s.subtitle) && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-8 pt-12 text-white sm:px-10"><div className="text-lg font-bold sm:text-2xl">{s.title}</div><div>{s.subtitle}</div></div>}
                </a>
              ))}
            </div>
            {slides.length > 1 && (
              <>
              <button type="button" onClick={() => moveSlide(-1)} aria-label="Slide anterior" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => moveSlide(1)} aria-label="Próximo slide" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"><ChevronRight className="h-5 w-5" /></button>
=======
                <div
                  key={s.id}
                  className="w-full shrink-0"
                  style={{ backgroundColor: s.bg_color || themed }}
                >
                  <div className="flex items-center gap-4 p-5 text-white sm:p-8 min-h-[140px] sm:min-h-[180px]">
                    {s.image_url && (
                      <img
                        src={s.image_url}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-28 sm:w-28"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-lg font-bold sm:text-2xl line-clamp-2">
                        {s.title}
                      </div>
                      {s.subtitle && (
                        <div className="mt-1 text-sm opacity-90 sm:text-base line-clamp-2">
                          {s.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {slides.length > 1 && (
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlideIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slideIdx ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
                  />
                ))}
              </div>
<<<<<<< HEAD
              </>
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            )}
          </div>
        )}

        {/* CATEGORIES */}
<<<<<<< HEAD
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Filtrar produtos">
                <ListFilter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuRadioGroup value={activeQuickFilter} onValueChange={setQuickFilter}>
                <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="available">Disponíveis</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="promotion">Em promoção</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="new">Novidades</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="top_rated">Mais avaliados</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {categories.length > 0 && (
            <div className="-mx-3 min-w-0 flex-1 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <div className="flex gap-2 pb-1">
                <button
                  onClick={() => setActiveCat("all")}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${activeCat === "all" ? "text-white" : "bg-background"}`}
                  style={
                    activeCat === "all"
=======
        {categories.length > 0 && (
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <div className="flex gap-2 pb-1">
              <button
                onClick={() => setActiveCat("all")}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${activeCat === "all" ? "text-white" : "bg-background"}`}
                style={
                  activeCat === "all"
                    ? { backgroundColor: themed, borderColor: themed }
                    : {}
                }
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${activeCat === c.id ? "text-white" : "bg-background"}`}
                  style={
                    activeCat === c.id
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                      ? { backgroundColor: themed, borderColor: themed }
                      : {}
                  }
                >
<<<<<<< HEAD
                  Todos
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${activeCat === c.id ? "text-white" : "bg-background"}`}
                    style={
                      activeCat === c.id
                        ? { backgroundColor: themed, borderColor: themed }
                        : {}
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PRODUCTS */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:gap-5">
          {filtered.map((p) => {
            const hasDiscount =
              p.discount_price && Number(p.discount_price) < Number(p.price);
            const cardMedia = p.media_items?.find((media) => media.media_type === "image") || p.media_items?.[0];
=======
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {filtered.map((p) => {
            const hasDiscount =
              p.discount_price && Number(p.discount_price) < Number(p.price);
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            return (
              <Card
                key={p.id}
                className="overflow-hidden cursor-pointer transition hover:shadow-md group"
                onClick={() => openProduct(p)}
              >
                <div className="aspect-square relative bg-muted overflow-hidden">
<<<<<<< HEAD
                  {cardMedia?.media_type === "video"
                    ? <video src={cardMedia.url} className="h-full w-full object-cover" muted playsInline />
                    : cardMedia?.url || p.image_url ? (
                    <img
                      src={cardMedia?.url || p.image_url || ""}
                      alt={p.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    ) : null}
=======
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  )}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                  {hasDiscount && (
                    <span className="absolute left-2 top-2 rounded bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                      PROMO
                    </span>
                  )}
                  {p.is_sold_out && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/85 text-sm font-bold uppercase tracking-wider text-destructive-foreground">
                      Esgotado
                    </div>
                  )}
                </div>
                <CardContent className="space-y-1.5 p-3">
                  <div className="line-clamp-2 text-sm font-semibold leading-tight min-h-[2.5em]">
                    {p.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Stars value={Math.round(p.rating_avg || 0)} size={12} />
                    <span className="text-[10px] text-muted-foreground">
                      ({p.rating_count})
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    {hasDiscount ? (
                      <>
                        <span
                          className="text-sm font-bold"
                          style={{ color: themed }}
                        >
                          {Number(p.discount_price).toLocaleString("pt-AO")} Kz
                        </span>
                        <span className="text-[11px] text-muted-foreground line-through">
                          {Number(p.price).toLocaleString("pt-AO")}
                        </span>
                      </>
                    ) : (
                      <span
                        className="text-sm font-bold"
                        style={{ color: themed }}
                      >
                        {Number(p.price).toLocaleString("pt-AO")} Kz
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="w-full text-white"
                    style={{ backgroundColor: themed }}
                    disabled={p.is_sold_out}
                    onClick={(e) => {
                      e.stopPropagation();
                      add(p);
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            Sem produtos nesta categoria.
          </div>
        )}
      </main>

      {/* CART FAB mobile */}
      {cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg sm:hidden"
          style={{ backgroundColor: themed }}
        >
          <ShoppingCart className="h-4 w-4" /> {total.toLocaleString("pt-AO")}{" "}
          Kz
        </button>
      )}

      {/* PRODUCT DETAIL */}
      <Dialog open={!!openP} onOpenChange={() => setOpenP(null)}>
<<<<<<< HEAD
        <DialogContent className="h-[94dvh] w-[96vw] max-w-[1440px] overflow-y-auto p-0">
          {openP && (
            <>
              <div className="grid min-h-full lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.8fr)]">
                <div className="bg-muted/30 p-4 sm:p-6">
                  {detailMedia.length > 0 ? (
                    <div className="relative">
                      <div
                        ref={detailMediaRef}
                        onScroll={(event) => {
                          const carousel = event.currentTarget;
                          setDetailMediaIndex(Math.round(carousel.scrollLeft / carousel.clientWidth));
                        }}
                        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-xl"
                        aria-label="Galeria de imagens e vídeos do produto"
                      >
                        {detailMedia.map((media) => (
                          <div key={media.url} className="w-full shrink-0 snap-center overflow-hidden rounded-xl border bg-background">
                            {media.media_type === "video"
                              ? <video src={media.url} className="h-[50vh] max-h-[70vh] w-full bg-black object-contain sm:h-[65vh]" controls playsInline />
                              : <img src={media.url} alt={openP.name} className="h-[50vh] max-h-[70vh] w-full object-contain sm:h-[65vh]" />}
                            {(media.color || media.size) && <div className="flex gap-2 p-3 text-sm text-muted-foreground">{media.color && <span>Cor: {media.color}</span>}{media.size && <span>Tamanho: {media.size}</span>}</div>}
                          </div>
                        ))}
                      </div>
                      {detailMedia.length > 1 && (
                        <>
                          <button type="button" onClick={() => scrollDetailMedia(Math.max(0, detailMediaIndex - 1))} disabled={detailMediaIndex === 0} aria-label="Mídia anterior" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-40">
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button type="button" onClick={() => scrollDetailMedia(Math.min(detailMedia.length - 1, detailMediaIndex + 1))} disabled={detailMediaIndex === detailMedia.length - 1} aria-label="Próxima mídia" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-40">
                            <ChevronRight className="h-5 w-5" />
                          </button>
                          <div className="mt-3 flex justify-center gap-1.5">
                            {detailMedia.map((media, index) => (
                              <button key={media.url} type="button" onClick={() => scrollDetailMedia(index)} aria-label={`Ver mídia ${index + 1}`} aria-current={index === detailMediaIndex} className={`h-2 rounded-full transition-all ${index === detailMediaIndex ? "w-6" : "w-2 bg-muted-foreground/40"}`} style={index === detailMediaIndex ? { backgroundColor: themed } : undefined} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-[50vh] items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground">Sem imagens ou vídeos para este produto.</div>
                  )}
                </div>
                <div className="space-y-4 p-4 sm:p-6">
                  <DialogHeader><DialogTitle className="text-2xl">{openP.name}</DialogTitle></DialogHeader>
=======
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {openP && (
            <>
              <DialogHeader>
                <DialogTitle className="line-clamp-2">{openP.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {(openP.image_urls?.length ? openP.image_urls : openP.image_url ? [openP.image_url] : []).map((url) => <img key={url} src={url} alt={openP.name} className="aspect-square w-full rounded object-cover" />)}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                <div className="flex items-center gap-2">
                  <Stars value={Math.round(openP.rating_avg || 0)} />
                  <span className="text-sm text-muted-foreground">
                    {openP.rating_avg.toFixed(1)} · {openP.rating_count}{" "}
                    avaliações
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {openP.description}
                </p>
                <div className="flex items-baseline gap-2">
                  {openP.discount_price ? (
                    <>
                      <span
                        className="text-2xl font-bold"
                        style={{ color: themed }}
                      >
                        {Number(openP.discount_price).toLocaleString("pt-AO")}{" "}
                        Kz
                      </span>
                      <span className="text-sm text-muted-foreground line-through">
                        {Number(openP.price).toLocaleString("pt-AO")}
                      </span>
                    </>
                  ) : (
                    <span
                      className="text-2xl font-bold"
                      style={{ color: themed }}
                    >
                      {Number(openP.price).toLocaleString("pt-AO")} Kz
                    </span>
                  )}
                </div>
                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: themed }}
                  disabled={openP.is_sold_out}
                  onClick={() => {
                    add(openP);
                    setOpenP(null);
                  }}
                >
                  {openP.is_sold_out ? "Esgotado" : "Adicionar ao carrinho"}
                </Button>
<<<<<<< HEAD
                {relatedProducts.length > 0 && <section className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold">Produtos relacionados</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {relatedProducts.map((related) => <button key={related.id} type="button" onClick={() => void openProduct(related)} className="overflow-hidden rounded-lg border text-left hover:bg-muted">
                      {(related.media_items?.find((media) => media.media_type === "image")?.url || related.image_url) && <img src={related.media_items?.find((media) => media.media_type === "image")?.url || related.image_url || ""} alt={related.name} className="aspect-[4/3] w-full object-cover" />}
                      <span className="block p-2 text-xs font-medium">{related.name}</span>
                      <span className="block px-2 pb-2 text-xs font-bold" style={{ color: themed }}>{Number(related.discount_price ?? related.price).toLocaleString("pt-AO")} Kz</span>
                    </button>)}
                  </div>
                </section>}
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e

                {/* REVIEWS */}
                <div className="space-y-3 border-t pt-4">
                  <div className="font-semibold">Avaliações</div>
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="text-sm font-medium">
                      Deixe a sua avaliação
                    </div>
                    <Input
                      placeholder="Seu nome (opcional)"
                      value={reviewForm.name}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, name: e.target.value })
                      }
                    />
                    <Stars
                      value={reviewForm.rating}
                      size={20}
                      onChange={(n) =>
                        setReviewForm({ ...reviewForm, rating: n })
                      }
                    />
                    <Textarea
                      placeholder="O que achou do produto?"
                      value={reviewForm.comment}
                      onChange={(e) =>
                        setReviewForm({
                          ...reviewForm,
                          comment: e.target.value,
                        })
                      }
                    />
                    <Button
                      size="sm"
                      onClick={submitReview}
                      disabled={!reviewForm.comment.trim()}
                    >
                      Enviar avaliação
                    </Button>
                  </div>
                  {reviews.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      Ainda sem avaliações. Seja o primeiro!
                    </div>
                  )}
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">
                          {r.reviewer_name}
                        </div>
                        <Stars value={r.rating} size={12} />
                      </div>
                      {r.comment && (
                        <p className="text-sm text-muted-foreground">
                          {r.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
<<<<<<< HEAD
              </div>
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
