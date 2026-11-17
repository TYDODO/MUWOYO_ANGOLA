import { ScrollArea } from "@/components/ui/scroll-area";
import { TermsContent } from "@/components/legal/TermsContent";

export function TermsOfUseViewer() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <main className="mx-auto max-w-4xl px-4">
        <header className="mb-8">
          <h1 className="text-center text-3xl font-bold">Termos de Uso</h1>
          <p className="mt-2 text-center text-gray-600">
            Última actualização: 17 de Novembro de 2026
          </p>
        </header>
        <ScrollArea className="h-[600px] w-full p-0">
          <TermsContent />
        </ScrollArea>
      </main>
    </div>
  );
}
