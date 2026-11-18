import { useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logo from "../../assets/muwoyo-logo.png";
import { useAuth } from "@/hooks/useAuth";

type HeaderLink = {
  label: string;
  href: string;
  section?: string;
  external?: boolean;
};

const navGroups: Array<{ label: string; links: HeaderLink[] }> = [
  {
    label: "Plataforma",
    links: [
      { label: "Início", href: "/#home", section: "home" },
      { label: "Funcionalidades", href: "/#capacidades", section: "capacidades" },
      { label: "Como funciona", href: "/#como-funciona", section: "como-funciona" },
    ],
  },
  {
    label: "Recursos",
    links: [
      { label: "Atendimento com IA", href: "/#funcionalidades", section: "funcionalidades" },
      { label: "O que a Muwoyo resolve", href: "/#features", section: "features" },
      { label: "Perguntas frequentes", href: "/#faq", section: "faq" },
    ],
  },
  {
    label: "Planos",
    links: [
      { label: "Planos mensais", href: "/#messages", section: "messages" },
      { label: "Falar com a equipa", href: "https://wa.me/244962011401", external: true },
    ],
  },
  {
    label: "Ajuda",
    links: [
      { label: "Falar com suporte", href: "https://wa.me/244962011401", external: true },
      { label: "Termos de Uso", href: "/termos-uso" },
      { label: "Política de Privacidade", href: "/politica-privacidade" },
    ],
  },
];

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate("/");
  }, [signOut, navigate]);

  const handleSectionClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, section: string) => {
      event.preventDefault();
      if (location.pathname === "/") {
        const target = document.getElementById(section);
        if (target) {
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - 96,
            behavior: "smooth",
          });
        }
        navigate({ pathname: "/", hash: section });
      } else {
        navigate({ pathname: "/", hash: section });
      }
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    if (location.pathname !== "/" || !location.hash) return;
    const section = decodeURIComponent(location.hash.slice(1));
    const timer = window.setTimeout(() => {
      const target = document.getElementById(section);
      if (target) {
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.scrollY - 96,
          behavior: "smooth",
        });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.pathname]);

  const renderLink = (item: HeaderLink) => (
    <DropdownMenuItem key={item.label} asChild>
      {item.external ? (
        <a href={item.href} target="_blank" rel="noreferrer">
          {item.label}
        </a>
      ) : (
        <Link to={item.href} onClick={item.section ? (event) => handleSectionClick(event, item.section || "") : undefined}>
          {item.label}
        </Link>
      )}
    </DropdownMenuItem>
  );

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/30 bg-background/70 backdrop-blur-2xl">
      <div className="container mx-auto px-4">
        <div className="flex h-20 items-center justify-between lg:h-24">
          <Link to="/" className="flex shrink-0 items-center gap-3 py-2">
            <img src={logo} alt="Muwoyo" className="h-7 w-auto max-w-[25vw] object-contain sm:h-8" />
            <span className="hidden font-display text-xl font-bold text-foreground sm:inline sm:text-2xl lg:text-3xl">
              Muwoyo
            </span>
          </Link>

          <nav aria-label="Navegação principal" className="hidden items-center gap-2 lg:flex">
            {navGroups.map((group) => (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="group gap-1 px-3 text-sm font-medium text-muted-foreground hover:text-primary">
                    {group.label}
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {group.links.map(renderLink)}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 px-0 lg:hidden" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[75vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
                {navGroups.map((group, index) => (
                  <div key={group.label}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                    {group.links.map(renderLink)}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {user ? (
              <button
                className="inline-flex h-9 items-center justify-center rounded-md bg-red-500 px-3 text-xs font-medium text-white transition-colors duration-200 hover:bg-red-600 sm:px-4 sm:text-sm"
                onClick={handleLogout}
              >
                Sair
              </button>
            ) : (
              <button
                className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-gray-100 sm:px-4 sm:text-sm"
                onClick={() => navigate("/login")}
              >
                Entrar
              </button>
            )}
            <Button
              variant="hero"
              className="h-9 px-3 text-xs font-semibold transition-all duration-300 sm:px-5 sm:text-sm"
              onClick={() => navigate("/criar-conta")}
            >
              Criar Conta
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
