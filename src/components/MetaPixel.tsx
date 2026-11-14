import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getMetaPixelConsent,
  isCommercialContentPath,
  isMetaPixelPageViewAllowed,
  META_PIXEL_CONSENT_EVENT,
  META_PIXEL_PREFERENCES_EVENT,
  setMetaPixelConsent,
  trackMetaEvent,
  type MetaPixelConsent,
} from "@/lib/meta-pixel";

export default function MetaPixel() {
  const location = useLocation();
  const [consent, setConsent] = useState<MetaPixelConsent>(getMetaPixelConsent);
  const [showPreferences, setShowPreferences] = useState(consent === "unknown");
  const [preferenceError, setPreferenceError] = useState("");
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const refreshConsent = () => setConsent(getMetaPixelConsent());
    const showConsentPreferences = () => setShowPreferences(true);
    window.addEventListener(META_PIXEL_CONSENT_EVENT, refreshConsent);
    window.addEventListener(META_PIXEL_PREFERENCES_EVENT, showConsentPreferences);
    return () => {
      window.removeEventListener(META_PIXEL_CONSENT_EVENT, refreshConsent);
      window.removeEventListener(META_PIXEL_PREFERENCES_EVENT, showConsentPreferences);
    };
  }, []);

  useEffect(() => {
    if (
      consent !== "accepted" ||
      !isMetaPixelPageViewAllowed(location.search, location.hash) ||
      lastTrackedPath.current === location.pathname
    ) {
      return;
    }

    lastTrackedPath.current = location.pathname;
    trackMetaEvent("PageView");
    if (isCommercialContentPath(location.pathname)) {
      trackMetaEvent("ViewContent", { content_name: "Muwoyo" });
    }
  }, [consent, location.hash, location.pathname, location.search]);

  const chooseConsent = (choice: "accepted" | "rejected") => {
    if (!setMetaPixelConsent(choice)) {
      setPreferenceError("Não foi possível guardar a sua escolha neste navegador. O Pixel permanecerá desativado.");
      return;
    }
    setConsent(choice);
    setPreferenceError("");
    setShowPreferences(false);
  };

  if (!showPreferences) return null;

  return (
    <aside
      aria-label="Preferências de cookies"
      className="fixed inset-x-0 bottom-0 z-[100] border-t bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl text-sm">
          <p className="font-semibold">Privacidade e cookies</p>
          <p className="mt-1 text-muted-foreground">
            Com o seu consentimento, usamos o Pixel da Meta para medir visitas e
            conversões de marketing. Não enviamos palavras-passe, tokens nem
            conteúdo de conversas. Pode alterar esta escolha na Política de
            Privacidade.
          </p>
          {preferenceError && <p role="alert" className="mt-2 text-destructive">{preferenceError}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            onClick={() => chooseConsent("rejected")}
          >
            Recusar
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => chooseConsent("accepted")}
          >
            Aceitar cookies de marketing
          </button>
        </div>
      </div>
    </aside>
  );
}
