"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";
import heroPolo from "@/assets/landing/hero-polo.png";
import heroTshirt from "@/assets/landing/hero-tshirt.jpg";
import heroShirt from "@/assets/landing/hero-shirt.jpg";
import heroJacket from "@/assets/landing/hero-jacket.jpg";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDatabase } from "@/integrations/supabase/app-types";
import { isVideoFile, normalizeVideoUrl } from "@/lib/video-url";

const appDb = supabase as unknown as SupabaseClient<AppDatabase>;

interface Message {
  text: string;
  from: "user" | "bot";
  img?: string;
  file?: string;
}

// Sequência de mensagens com imagens reais de roupas
const messagesSequence: Message[] = [
  {
    text: "Olá! Vi as camisas da Adama. Ainda têm a Polo branca?",
    from: "user",
  },
  {
    text: "Olá! 👋 Temos sim. A Polo Branca está disponível. Também temos outros modelos de polos e t-shirts. Qual tamanho procura?",
    from: "bot",
  },
  { text: "Tamanho M. Pode enviar fotos?", from: "user" },
  { text: "Claro! Veja alguns modelos disponíveis no tamanho M:", from: "bot" },
  {
    text: "Polo Premium Branca",
    from: "bot",
    img: heroPolo,
  },
  {
    text: "T-shirt Casual Azul",
    from: "bot",
    img: heroTshirt,
  },
  {
    text: "Camisa Social Cinza",
    from: "bot",
    img: heroShirt,
  },
  {
    text: "Jaqueta Streetwear Preta",
    from: "bot",
    img: heroJacket,
  },
  {
    text: "Gostei das duas primeiras. Tem algum desconto se eu levar mais de 2 peças?",
    from: "user",
  },
  {
    text: "Sim! Se levar 3 ou mais produtos, você ganha 10% de desconto no total.",
    from: "bot",
  },
  {
    text: "Perfeito, vou levar Polo Branca + T-shirt Azul + Camisa Cinza",
    from: "user",
  },
  {
    text: "Excelente escolha! 😊 Vou preparar o seu pedido. Para calcular o valor da entrega, diga-me, por favor, em que zona ou município pretende receber o pedido.",
    from: "bot",
  },
  { text: "Vivo em Cabinda.", from: "user" },
  {
    text: "Perfeito. Para entrega em Cabinda, o custo é de 2.000 Kz.\n\nResumo do pedido:\n- Polo Premium Branca\n- T-shirt Casual Azul\n- Camisa Social Cinza\n- 10% de desconto aplicado\n- Entrega: 2.000 Kz\n\nTotal a pagar: 46.200 Kz\n\nDeseja avançar para o pagamento?",
    from: "bot",
  },
  {
    text: "Perfeito. Pode efetuar o pagamento para:\n\nTitular: Adama Store\nIBAN: AO06 0000 1234 5678 9012 3456\nValor: 46.200 Kz\n\nDepois do pagamento, envie o comprovativo aqui para confirmarmos o seu pedido. 😊",
    from: "bot",
  },
  {
    text: "Pagamento feito! Segue o comprovativo.",
    from: "user",
    file: "comprovativo.pdf",
  },
  {
    text: "Recebemos o comprovativo. Obrigado! O seu pedido será confirmado pela nossa equipa e receberá uma atualização assim que estiver em preparação. 🙌",
    from: "bot",
  },
];

const heroTitle = "A infraestrutura angolana que reúne tudo o que o seu negócio precisa para atender, vender e escalar automaticamente.";
const heroDescription = "Uma plataforma completa que reúne atendimento automatizado com atendentes virtuais, CRM, campanhas, gestão de produtos, loja online, vendas, pedidos, entregas, Inbox e muito mais. Tudo o que o seu negócio precisa para automatizar processos, aumentar a produtividade, vender mais e crescer sem precisar aumentar proporcionalmente a sua equipa.";

function highlightHeroWords(text: string, underline = true) {
  const parts = text.split(/(escalar automaticamente|automatizar processos|vender mais|angolana|atender|vender|produtividade|crescer)/gi);
  return parts.map((part, index) => {
    const emphasized = /^(escalar automaticamente|automatizar processos|vender mais|angolana|atender|vender|produtividade|crescer)$/i.test(part);
    return emphasized
      ? <span key={index} className={underline ? "text-emerald-700 underline decoration-emerald-500/70 decoration-1 underline-offset-4" : "text-emerald-700"}>{part}</span>
      : part;
  });
}

export default function HeroSection() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [heroCopy, setHeroCopy] = useState("");
  const [introVideo, setIntroVideo] = useState<{ title: string; video_url: string; cover_url: string | null } | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHeroCopy(heroTitle);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let position = 0;
    let deleting = false;
    const animate = () => {
      if (!deleting) {
        position += 1;
        setHeroCopy(heroTitle.slice(0, position));
        if (position >= heroTitle.length) {
          timer = setTimeout(() => {
            deleting = true;
            animate();
          }, 4500);
          return;
        }
        timer = setTimeout(animate, 55);
        return;
      }

      const lastWordStart = heroTitle.lastIndexOf(" ", position - 1);
      position = lastWordStart >= 0 ? lastWordStart : 0;
      setHeroCopy(heroTitle.slice(0, position));
      if (position === 0) {
        deleting = false;
        timer = setTimeout(animate, 500);
        return;
      }
      timer = setTimeout(animate, 120);
    };

    timer = setTimeout(animate, 350);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await appDb
        .from("tutorial_videos")
        .select("title,video_url,cover_url")
        .eq("is_published", true)
        .eq("is_intro_video", true)
        .maybeSingle();
      if (error) {
        console.warn("Não foi possível carregar o vídeo de apresentação.", error);
        return;
      }
      setIntroVideo(data);
    })();
  }, []);

  useEffect(() => {
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const showNext = () => {
      const message = messagesSequence[index];
      if (!message) {
        timer = setTimeout(() => {
          setMessages([]);
          index = 0;
          showNext();
        }, 3000);
        return;
      }

      if (message.from === "bot") {
        setTyping(true);
        timer = setTimeout(() => {
          setTyping(false);
          setMessages((current) => [...current, message]);
          index += 1;
          timer = setTimeout(showNext, 1500);
        }, 1800);
        return;
      }

      timer = setTimeout(() => {
        setMessages((current) => [...current, message]);
        index += 1;
        timer = setTimeout(showNext, 1200);
      }, 1000);
    };

    showNext();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, typing]);

  return (
    <section id="home" className="relative min-h-screen flex items-center bg-white overflow-hidden pt-32 sm:pt-36 lg:pt-20">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-emerald-400/10 blur-[120px] rounded-full"></div>

      <div className="container mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-8 items-start">
        {/* TEXTO */}
        <div className="space-y-8 animate-fade-up lg:mt-24">
          <h1 aria-label={heroTitle} className="min-h-[6.6rem] text-2xl font-semibold leading-[1.14] tracking-[-0.035em] text-slate-800 sm:min-h-[7rem] sm:text-3xl md:text-4xl lg:min-h-[10rem] lg:text-[2.75rem]">
            {highlightHeroWords(heroCopy)}
            <span aria-hidden="true" className="ml-1 inline-block h-[0.8em] w-0.5 animate-pulse bg-emerald-500 align-middle" />
          </h1>

          <p aria-label={heroDescription} className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            {highlightHeroWords(heroDescription, false)}
          </p>

          <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center">
            <Button
              size="lg"
              className="h-14 rounded-full bg-emerald-600 px-8 text-base font-semibold text-white shadow-[0_8px_24px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-[0_12px_30px_rgba(5,150,105,0.4)]"
              asChild
            >
              <Link to="/criar-conta" className="flex items-center justify-center">
                Criar conta gratuitamente{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-full border-2 border-emerald-700/25 bg-white/80 px-7 text-base font-semibold text-emerald-800 shadow-[0_6px_18px_rgba(5,150,105,0.12)] transition hover:-translate-y-0.5 hover:border-emerald-700/40 hover:bg-emerald-50 hover:shadow-[0_10px_24px_rgba(5,150,105,0.22)]"
              onClick={() => setIntroOpen(true)}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Ver como funciona
            </Button>
          </div>
        </div>

        {/* TELEFONE */}
        <div className="relative flex justify-center lg:justify-end animate-fade-in lg:-mr-8">
          <div className="relative w-full max-w-[520px]">
            <img
              src="/muwoyo-chat.png"
              alt="Dashboard do CRM Muwoyo mostrando interface de chat com IA para automação de vendas no WhatsApp"
              className="w-full h-auto block drop-shadow-2xl"
            />

            {/* CHAT */}
            <div
              ref={containerRef}
              className="absolute top-[22%] left-[15%] w-[70%] h-[52%] flex flex-col gap-[6px] overflow-hidden px-2 pt-2"
            >
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`max-w-[72%] px-3 py-2 text-[10.5px] leading-snug shadow-sm animate-messagePop
                    ${
                      msg.from === "user"
                        ? "bg-[#d9fdd3] self-end rounded-lg mr-1"
                        : "bg-white self-start rounded-lg ml-1"
                    }`}
                >
                  <div className="whitespace-pre-line">{msg.text}</div>
                  {msg.img && (
                    <img
                      src={msg.img}
                      alt="Produto mostrado no chat de vendas automatizado do WhatsApp"
                      className="mt-2 rounded-md h-28 w-full object-cover"
                    />
                  )}
                  {msg.file && (
                    <div className="mt-2 p-2 bg-slate-100 rounded-md text-[9px] font-medium">
                      {msg.file}
                    </div>
                  )}
                  <div className="text-[7px] text-right text-slate-400 mt-[2px]">
                    12:45
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex gap-1 px-3 py-2 bg-white rounded-lg w-14 ml-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-300"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={introOpen} onOpenChange={setIntroOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{introVideo?.title || "Como funciona a Muwoyo"}</DialogTitle>
            <DialogDescription>Veja a apresentação da plataforma sem sair desta página.</DialogDescription>
          </DialogHeader>
          {introVideo ? <IntroVideoFrame video={introVideo} /> : <p className="py-12 text-center text-sm text-muted-foreground">O vídeo de apresentação será disponibilizado em breve.</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function IntroVideoFrame({ video }: { video: { title: string; video_url: string; cover_url: string | null } }) {
  const source = normalizeVideoUrl(video.video_url);
  if (isVideoFile(source)) {
    return <video className="aspect-video w-full rounded-md bg-black" controls playsInline poster={video.cover_url || undefined} src={source} />;
  }
  return <div className="aspect-video overflow-hidden rounded-md bg-black"><iframe className="h-full w-full" src={source} title={video.title} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
}
