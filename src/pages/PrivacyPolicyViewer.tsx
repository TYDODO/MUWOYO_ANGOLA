import { ScrollArea } from "@/components/ui/scroll-area";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { openMetaPixelPreferences } from "@/lib/meta-pixel";

export function PrivacyPolicyViewer() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <main className="mx-auto max-w-4xl px-4">
        <header className="mb-8">
          <h1 className="text-center text-3xl font-bold">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-center text-gray-600">
            Última actualização: 17 de Novembro de 2026
          </p>
        </header>
        <ScrollArea className="h-[600px] w-full p-0">
          <PrivacyContent />
        </ScrollArea>
        <button
          type="button"
          className="mt-4 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-100"
          onClick={openMetaPixelPreferences}
        >
          Gerir preferências de cookies
        </button>
      </main>
    </div>
  );
}
