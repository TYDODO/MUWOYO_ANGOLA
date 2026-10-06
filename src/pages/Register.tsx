import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/muwoyo-logo.png";

const ANGOLA_PROVINCES = [
  "Bengo", "Benguela", "Bié", "Cabinda", "Cuando", "Cubango", "Cuanza Norte",
  "Cuanza Sul", "Cunene", "Huambo", "Huíla", "Icolo e Bengo", "Luanda", "Lunda Norte",
  "Lunda Sul", "Malanje", "Moxico", "Moxico Leste", "Namibe", "Uíge", "Zaire",
];

export default function Register() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;

  useEffect(() => {
    if (!user) return;
    const pendingEmail = window.sessionStorage.getItem("muwoyo_pending_email");
    if (pendingEmail) {
      navigate("/confirmar-email", { replace: true, state: { email: pendingEmail } });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  if (user) return <div className="min-h-screen bg-gray-100" />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordScore < 5) {
      toast({ title: "Senha fraca", description: "Use pelo menos 8 caracteres, maiúscula, minúscula, número e símbolo.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const referralCode = new URLSearchParams(window.location.search).get("ref")?.trim() || undefined;
    const { error } = await signUp(email, password, {
      full_name: name,
      phone: phone.replace(/\D/g, ""),
      province,
      referral_code: referralCode,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Não foi possível criar a conta", description: error, variant: "destructive" });
      return;
    }
    window.sessionStorage.setItem("muwoyo_pending_email", email);
    toast({
      title: "Conta criada",
      description: "Confira o seu email para confirmar o acesso. Você receberá 100 mensagens durante 3 dias de teste.",
    });
    navigate("/confirmar-email", { replace: true, state: { email, initialSend: true } });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col md:flex-row md:min-h-[600px]">
        <div className="w-full md:w-1/2 bg-gray-50 p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-8 flex items-center gap-3">
            <img src={logo} alt="Muwoyo" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Muwoyo</h1>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Criar conta</h2>
          <p className="text-gray-500 mb-8">Comece com 100 mensagens gratuitas durante 3 dias</p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome completo"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
            </div>
            <div>
              <label htmlFor="province" className="mb-1 block text-sm text-gray-500">Província</label>
              <select
                id="province"
                required
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                className="w-full border-b border-gray-300 bg-transparent py-2 outline-none transition focus:border-whatsapp"
              >
                <option value="">Selecione a sua província</option>
                {ANGOLA_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
            </div>
            <div>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Telefone"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
            </div>
            <div>
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Senha forte"
                className="w-full border-b border-gray-300 py-2 bg-transparent outline-none transition focus:border-whatsapp"
              />
              <div className="mt-3 space-y-2">
                <div className="flex gap-1" aria-label={`Força da senha: ${passwordScore} de 5`}>
                  {Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index < passwordScore ? (passwordScore < 4 ? "bg-amber-400" : "bg-emerald-500") : "bg-gray-200"}`} />)}
                </div>
                <p className="text-xs text-gray-500">Use 8+ caracteres com maiúscula, minúscula, número e símbolo.</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-whatsapp transition"
                onClick={() => setShow(!show)}
              >
                {show ? "Ocultar senha" : "Mostrar senha"}
              </button>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-whatsapp transition"
                onClick={() => navigate("/login")}
              >
                Já tenho conta
              </button>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-whatsapp py-3 text-white font-semibold hover:bg-green-800 transition"
              disabled={submitting}
            >
              {submitting ? "Carregando..." : "Criar conta"}
            </button>
          </form>
          <div className="mt-auto space-y-4 pt-10 text-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Já possui conta?</span>
              <button type="button" className="rounded border border-gray-300 px-4 py-1 text-sm hover:bg-gray-200 transition" onClick={() => navigate("/login")}>Login</button>
            </div>
            <button type="button" className="text-left text-sm text-gray-500 hover:text-whatsapp transition" onClick={() => navigate("/")}>Voltar para o site</button>
          </div>
        </div>
        <div className="w-full md:w-1/2 bg-[#25D366] p-12 flex flex-col justify-center text-white relative overflow-hidden">
          <h2 className="text-4xl font-bold leading-tight mb-4">Seja bem-vindo a Muwoyo</h2>
          <p className="text-white/80">Crie a sua conta para começares a automatizar o teu WhatsApp agora mesmo.</p>
          <div className="mt-12 flex justify-center opacity-80">
            <svg viewBox="0 0 200 200" className="w-64 h-64 text-white">
              <circle cx="100" cy="100" r="80" fill="currentColor" fillOpacity="0.1" />
              <path d="M50 150 Q100 120 150 150" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
              <rect x="70" y="60" width="60" height="80" rx="10" fill="white" fillOpacity="0.2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}