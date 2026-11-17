export type MetaPixelConsent = "unknown" | "accepted" | "rejected";
export type MetaPixelEvent =
  | "PageView"
  | "ViewContent"
  | "Contact"
  | "CompleteRegistration"
  | "StartTrial"
  | "Purchase";

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: (...args: unknown[]) => void;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    __muwoyoMetaPixelInitialized?: boolean;
  }
}

export const META_PIXEL_CONSENT_EVENT = "muwoyo:meta-pixel-consent";
export const META_PIXEL_PREFERENCES_EVENT = "muwoyo:meta-pixel-preferences";

const CONSENT_STORAGE_KEY = "muwoyo:meta-pixel-consent";
const PIXEL_SCRIPT_ID = "muwoyo-meta-pixel-script";
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID?.trim() || "1323564576501408";

export function getMetaPixelConsent(): MetaPixelConsent {
  try {
    const consent = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return consent === "accepted" || consent === "rejected" ? consent : "unknown";
  } catch (error) {
    console.error("Could not read the Meta Pixel consent preference.", error);
    return "unknown";
  }
}

export function setMetaPixelConsent(consent: Exclude<MetaPixelConsent, "unknown">): boolean {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch (error) {
    console.error("Could not save the Meta Pixel consent preference.", error);
    return false;
  }
  window.dispatchEvent(new Event(META_PIXEL_CONSENT_EVENT));
  return true;
}

export function openMetaPixelPreferences() {
  window.dispatchEvent(new Event(META_PIXEL_PREFERENCES_EVENT));
}

export function isMetaPixelPageViewAllowed(search: string, hash: string): boolean {
  const sensitiveParameter = /(access_?token|refresh_?token|id_?token|auth|code|email|otp|password|secret|session)/i;
  const params = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));

  return ![...params.keys(), ...hashParams.keys()].some((key) => sensitiveParameter.test(key));
}

export function isCommercialContentPath(pathname: string): boolean {
  return pathname === "/";
}

function initializeMetaPixel(): boolean {
  if (!/^\d{5,20}$/.test(PIXEL_ID)) {
    console.error("Meta Pixel is disabled because VITE_META_PIXEL_ID is invalid.");
    return false;
  }

  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as MetaPixelFunction;
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
  }

  if (!window.__muwoyoMetaPixelInitialized) {
    window.fbq("set", "autoConfig", false, PIXEL_ID);
    window.fbq("init", PIXEL_ID);
    window.__muwoyoMetaPixelInitialized = true;
  }

  if (!document.getElementById(PIXEL_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onerror = () => console.error("The Meta Pixel script could not be loaded.");
    document.head.appendChild(script);
  }

  return true;
}

export function trackMetaEvent(
  event: MetaPixelEvent,
  parameters?: Record<string, string | number | boolean>,
): boolean {
  if (
    getMetaPixelConsent() !== "accepted" ||
    !isMetaPixelPageViewAllowed(window.location.search, window.location.hash) ||
    !initializeMetaPixel()
  ) {
    return false;
  }
  if (parameters) window.fbq?.("track", event, parameters);
  else window.fbq?.("track", event);
  return true;
}
