import { Link } from "react-router-dom";
import { Bell, Bot, CreditCard, FlaskConical, Package, ShieldCheck } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";

const settings = [
  { title: "Planos e pacotes", detail: "Preços, mensagens e publicação", to: "/admin/planos", icon: Package },
  { title: "Meios de pagamento", detail: "IBAN, referência e instruções", to: "/admin/pagamentos", icon: CreditCard },
  { title: "Custos de IA", detail: "Tarifas e consumo por modelo", to: "/admin/ai-custos", icon: Bot },
  { title: "Testes gratuitos", detail: "Contas em período de teste", to: "/admin/testes", icon: FlaskConical },
  { title: "Notificações", detail: "Histórico e avisos administrativos", to: "/admin/notificacoes", icon: Bell },
  { title: "Auditoria", detail: "Eventos registados pela plataforma", to: "/admin/auditoria", icon: ShieldCheck },
];

export default function AdminSettings() {
  return (
    <AdminShell mode="admin" title="Definições administrativas" description="Configurações comerciais e operacionais da plataforma.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {settings.map((setting) => <Link key={setting.to} to={setting.to} className="group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Card className="h-full transition-colors group-hover:bg-muted/30"><CardContent className="flex items-start gap-3 p-4"><span className="rounded-md bg-muted p-2 text-muted-foreground"><setting.icon className="h-4 w-4" /></span><span><span className="block font-medium">{setting.title}</span><span className="mt-1 block text-sm text-muted-foreground">{setting.detail}</span></span></CardContent></Card></Link>)}
      </div>
    </AdminShell>
  );
}