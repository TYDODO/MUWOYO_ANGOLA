import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, CheckCircle2 } from "lucide-react";
import logo from "@/assets/muwoyo-logo.png";

type WithdrawalReceiptProps = {
  transactionId: string;
  paymentId: string;
  affiliateName: string;
  affiliateCode: string;
  amount: number;
  bankName: string;
  accountHolder: string;
  iban: string;
  paymentReference: string;
  requestedAt: string;
  paidAt: string;
  status: "processing" | "paid";
};

export default function WithdrawalReceipt({
  transactionId,
  paymentId,
  affiliateName,
  affiliateCode,
  amount,
  bankName,
  accountHolder,
  iban,
  paymentReference,
  requestedAt,
  paidAt,
  status,
}: WithdrawalReceiptProps) {
  const [showAnimation, setShowAnimation] = useState(status === "paid");

  useEffect(() => {
    if (status === "paid") {
      setShowAnimation(true);
    }
  }, [status]);

  const maskIban = (iban: string) => {
    if (!iban || iban.length < 8) return iban;
    return iban.slice(0, 4) + " •••• •••• •••• " + iban.slice(-4);
  };

  const downloadReceipt = () => {
    const content = `
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  MUWOYO                              COMPROVATIVO         ║
║                                      DE PAGAMENTO         ║
║                                                          ║
║  Programa de Afiliados                  ${status === "paid" ? "✓ PAGO" : "⏳ PROCESSAMENTO"}            ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  COMPROVATIVO                                            ║
║  ${paymentId}                               ║
║                                                          ║
║  Data de emissão                                         ║
║  ${new Date(paidAt || requestedAt).toLocaleDateString("pt-PT")} · ${new Date(paidAt || requestedAt).toLocaleTimeString("pt-PT")}                                    ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  DESTINATÁRIO                                           ║
║                                                          ║
║  ${affiliateName}                                      ║
║  Afiliado: ${affiliateCode}                           ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  DETALHES DO PAGAMENTO                                  ║
║                                                          ║
║  Valor do saque                         ${amount.toLocaleString("pt-PT")} Kz        ║
║  Taxa                                        0 Kz        ║
║  VALOR PAGO                              ${amount.toLocaleString("pt-PT")} Kz        ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  DESTINO DO PAGAMENTO                                   ║
║                                                          ║
║  Banco: ${bankName}                                      ║
║  Titular: ${accountHolder}                              ║
║  IBAN: ${maskIban(iban)}                         ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  IDENTIFICAÇÃO DA TRANSAÇÃO                             ║
║                                                          ║
║  ID do saque:                                            ║
║  ${transactionId}                                ║
║                                                          ║
║  ID do pagamento:                                        ║
║  ${paymentId}                               ║
║                                                          ║
║  Referência: ${paymentReference}                              ║
║                                                          ║
║  Solicitado: ${new Date(requestedAt).toLocaleDateString("pt-PT")} · ${new Date(requestedAt).toLocaleTimeString("pt-PT")}                        ║
║  Pago:       ${new Date(paidAt || requestedAt).toLocaleDateString("pt-PT")} · ${new Date(paidAt || requestedAt).toLocaleTimeString("pt-PT")}                        ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  ORIGEM                                                 ║
║  Programa de Afiliados Muwoyo                           ║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Este documento confirma o processamento do pagamento    ║
║  pela Muwoyo para os dados bancários fornecidos pelo     ║
║  afiliado.                                               ║
║                                                          ║
║  Em caso de dúvidas, contacte o suporte:                 ║
║  Email: suporte@muwoyo.com                               ║
║  Telefone: +244 928 663 898                              ║
║                                                          ║
║                         MUWOYO                           ║
║                                                          ║
└══════════════════════════════════════════════════════════┘
    `.trim();

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `muwoyo-comprovativo-${paymentId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {status === "paid" && showAnimation && (
        <div className="flex justify-center">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4 rounded-lg border-2 border-foreground p-8 font-mono text-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xl font-bold">MUWOYO</div>
            <div className="text-xs">Programa de Afiliados</div>
          </div>
          <div className="text-right space-y-1">
            <div className="font-bold">COMPROVATIVO</div>
            <div className="text-xs">DE PAGAMENTO</div>
            {status === "paid" && <div className="mt-2 inline-block rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">✓ PAGO</div>}
            {status === "processing" && <div className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">⏳ PROCESSAMENTO</div>}
          </div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Comprovativo</div>
          <div>{paymentId}</div>
          <div className="mt-3 text-xs">Data de emissão</div>
          <div>{new Date(paidAt || requestedAt).toLocaleDateString("pt-PT")} · {new Date(paidAt || requestedAt).toLocaleTimeString("pt-PT")}</div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Destinatário</div>
          <div className="space-y-1">
            <div>{affiliateName}</div>
            <div className="text-xs text-muted-foreground">Afiliado: {affiliateCode}</div>
          </div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Detalhes do pagamento</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Valor do saque</span>
              <span className="font-semibold">{amount.toLocaleString("pt-PT")} Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Taxa</span>
              <span>0 Kz</span>
            </div>
            <div className="flex justify-between border-t border-foreground pt-1 font-bold">
              <span>VALOR PAGO</span>
              <span>{amount.toLocaleString("pt-PT")} Kz</span>
            </div>
          </div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Destino do pagamento</div>
          <div className="space-y-1">
            <div>Banco: {bankName}</div>
            <div>Titular: {accountHolder}</div>
            <div>IBAN: {maskIban(iban)}</div>
          </div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Identificação da transação</div>
          <div className="space-y-2">
            <div>
              <div className="text-xs">ID do saque:</div>
              <div className="font-mono text-xs">{transactionId}</div>
            </div>
            <div>
              <div className="text-xs">ID do pagamento:</div>
              <div className="font-mono text-xs">{paymentId}</div>
            </div>
            <div>
              <div className="text-xs">Referência:</div>
              <div className="font-mono text-xs">{paymentReference}</div>
            </div>
            <div className="mt-2 border-t border-foreground pt-2">
              <div className="text-xs">Solicitado: {new Date(requestedAt).toLocaleDateString("pt-PT")} · {new Date(requestedAt).toLocaleTimeString("pt-PT")}</div>
              <div className="text-xs">Pago: {new Date(paidAt || requestedAt).toLocaleDateString("pt-PT")} · {new Date(paidAt || requestedAt).toLocaleTimeString("pt-PT")}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-foreground pt-4">
          <div className="mb-3 text-xs font-bold uppercase">Origem</div>
          <div className="text-xs">Programa de Afiliados Muwoyo</div>
        </div>

        <div className="border-t border-foreground pt-4 text-center text-xs">
          <div className="mb-3">Este documento confirma o processamento do pagamento pela Muwoyo para os dados bancários fornecidos pelo afiliado.</div>
          <div className="mb-3">Em caso de dúvidas, contacte o suporte:</div>
          <div className="space-y-1">
            <div>Email: suporte@muwoyo.com</div>
            <div>Telefone: +244 928 663 898</div>
          </div>
          <div className="mt-4 border-t border-foreground pt-3 font-bold">MUWOYO</div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={downloadReceipt} className="gap-2" variant="outline">
          <Download className="h-4 w-4" /> Descarregar Comprovativo
        </Button>
        <Button onClick={() => setShowAnimation(false)} className="flex-1">
          Continuar
        </Button>
      </div>
    </div>
  );
}
