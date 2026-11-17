<<<<<<< HEAD
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

=======
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCallback } from "react";
import logo from "../../assets/muwoyo-logo.png";
import { useAuth } from "@/hooks/useAuth";

const Header = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  console.log("Estado do usuário:", user ? "Logado" : "Não logado");

  const handleLoginClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      console.log("Botão Entrar clicado!");
      console.log("Navegando para login...");
      try {
        setTimeout(() => {
          navigate("/login");
          console.log("Navegação para login completada!");
        }, 100);
      } catch (error) {
        console.error("Erro ao navegar para login:", error);
      }
    },
    [navigate],
  );

>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
  const handleLogout = useCallback(async () => {
    await signOut();
    navigate("/");
  }, [signOut, navigate]);

<<<<<<< HEAD
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
=======
  const navLinks = [
    { href: "/#home", label: "Home", scrollTo: "home" },
    { href: "/#funcionalidades", label: "Funcionalidades", scrollTo: "funcionalidades" },
    { href: "/#como-funciona", label: "Como funciona", scrollTo: "como-funciona" },
    { href: "/#precos", label: "Preços", scrollTo: "precos" },
    { href: "/#faq", label: "Perguntas", scrollTo: "faq" },
  ];

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return false;
    return location.pathname === href;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-2xl border-b border-border/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20 lg:h-24">
          {/* Logo + Name */}
          <Link to="/" className="flex items-center gap-3 py-2 shrink-0">
            <img
              src={logo}
              alt="Muwoyo"
              className="h-8 w-auto object-contain"
            />
            <span className="font-display font-bold text-xl sm:text-2xl lg:text-3xl text-foreground">
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
              Muwoyo
            </span>
          </Link>

<<<<<<< HEAD
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
=======
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={(e) => {
                  if (link.scrollTo) {
                    e.preventDefault();
                    const element = document.getElementById(link.scrollTo);
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    }
                  }
                }}
                className={`text-sm font-medium transition-all duration-300 hover:text-primary relative group ${
                  isActive(link.href) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                className="font-medium h-9 text-xs sm:text-sm px-3 sm:px-4 bg-red-500 text-white hover:bg-red-600 rounded-md transition-colors duration-200 inline-flex items-center justify-center"
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
                onClick={handleLogout}
              >
                Sair
              </button>
            ) : (
              <button
<<<<<<< HEAD
                className="inline-flex h-9 items-center justify-center rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-gray-100 sm:px-4 sm:text-sm"
                onClick={() => navigate("/login")}
=======
                className="font-medium h-9 text-xs sm:text-sm px-3 sm:px-4 bg-transparent hover:bg-gray-100 rounded-md transition-colors duration-200 inline-flex items-center justify-center"
                onClick={handleLoginClick}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
              >
                Entrar
              </button>
            )}
            <Button
              variant="hero"
<<<<<<< HEAD
              className="h-9 px-3 text-xs font-semibold transition-all duration-300 sm:px-5 sm:text-sm"
              onClick={() => navigate("/criar-conta")}
=======
              className="px-3 sm:px-5 h-9 text-xs sm:text-sm font-semibold transition-all duration-300 btn-shimmer btn-wave"
              onClick={() => {
                navigate("/criar-conta");
              }}
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
