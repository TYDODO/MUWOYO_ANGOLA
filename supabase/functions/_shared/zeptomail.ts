export const DEFAULT_ZEPTO_MAIL_ENDPOINT = "https://cpaas.zoho.com/v1.1/email";
export const ZEPTO_MAIL_MAX_ATTEMPTS = 3;

type EmailAddress = { address: string; name?: string };
export type ZeptoMailPayload = {
  from: EmailAddress;
  to: Array<{ email_address: EmailAddress }>;
  subject: string;
  htmlbody?: string;
  textbody?: string;
  client_reference?: string;
};

type ZeptoMailOptions = {
  endpoint?: string;
  apiKey: string;
  payload: ZeptoMailPayload;
  correlationId: string;
  sensitiveValues?: string[];
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

export type ZeptoMailResult =
  | { ok: true; status: number; attempts: number; responseKind: "json" | "empty" | "invalid_json" }
  | { ok: false; status: number; attempts: number; retryable: boolean; responseKind: "json" | "empty" | "invalid_json" | "network_error"; detail: string };

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function resolveZeptoMailEndpoint(configured?: string) {
  const value = configured?.trim() || DEFAULT_ZEPTO_MAIL_ENDPOINT;
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const endpoint = new URL(withProtocol);

  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError("Invalid ZeptoMail endpoint configuration");
  }
  if (endpoint.hostname !== "cpaas.zoho.com") {
    throw new TypeError("Unexpected ZeptoMail endpoint host");
  }
  if (endpoint.pathname === "/" || endpoint.pathname === "") endpoint.pathname = "/v1.1/email";
  if (endpoint.pathname !== "/v1.1/email") {
    throw new TypeError("Invalid ZeptoMail endpoint path");
  }

  return endpoint.toString();
}

export function isServiceRoleAuthorized(authorization: string | null, serviceRoleKey: string) {
  return Boolean(serviceRoleKey) && authorization === `Bearer ${serviceRoleKey}`;
}

export function isValidEmailAddress(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function sanitizeText(value: string, sensitiveValues: string[]) {
  let safe = value;
  for (const sensitive of sensitiveValues) {
    if (sensitive) safe = safe.split(sensitive).join("[redacted]");
  }
  return safe
    .replace(/Zoho-enczapikey\s+\S+/gi, "Zoho-enczapikey [redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
}

function sanitizeJson(value: unknown, sensitiveValues: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, sensitiveValues));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /email|address|recipient|name|authorization|api.?key|token|password|verification.?code|otp/i.test(key)
        ? "[redacted]"
        : sanitizeJson(item, sensitiveValues),
    ]));
  }
  return typeof value === "string" ? sanitizeText(value, sensitiveValues) : value;
}

export function sanitizeZeptoMailResponse(raw: string, sensitiveValues: string[] = []) {
  if (!raw.trim()) return { kind: "empty" as const, detail: "empty_response" };
  try {
    const parsed = JSON.parse(raw);
    return { kind: "json" as const, detail: JSON.stringify(sanitizeJson(parsed, sensitiveValues)) };
  } catch {
    return { kind: "invalid_json" as const, detail: `invalid_json: ${sanitizeText(raw, sensitiveValues).slice(0, 1000)}` };
  }
}

function isTransientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function sendZeptoMail(options: ZeptoMailOptions): Promise<ZeptoMailResult> {
  const endpoint = resolveZeptoMailEndpoint(options.endpoint);
  const fetcher = options.fetcher || fetch;
  const wait = options.wait || delay;
  const sensitiveValues = [options.apiKey, ...(options.sensitiveValues || [])];
  const payload = JSON.stringify({ ...options.payload, client_reference: options.correlationId });

  for (let attempt = 1; attempt <= ZEPTO_MAIL_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      const request: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Zoho-enczapikey ${options.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: payload,
      };
      if (typeof AbortSignal.timeout === "function") request.signal = AbortSignal.timeout(10000);
      response = await fetcher(endpoint, request);
    } catch (error) {
      const detail = sanitizeText(error instanceof Error ? error.message : String(error), sensitiveValues).slice(0, 1000);
      if (attempt < ZEPTO_MAIL_MAX_ATTEMPTS) {
        await wait(250 * (2 ** (attempt - 1)));
        continue;
      }
      return { ok: false, status: 0, attempts: attempt, retryable: true, responseKind: "network_error", detail: detail || "network_error" };
    }

    let raw = "";
    try {
      raw = await response.text();
    } catch {
      raw = "";
    }
    const parsed = sanitizeZeptoMailResponse(raw, sensitiveValues);
    if (response.ok) {
      return { ok: true, status: response.status, attempts: attempt, responseKind: parsed.kind };
    }

    const retryable = isTransientStatus(response.status);
    if (retryable && attempt < ZEPTO_MAIL_MAX_ATTEMPTS) {
      await wait(250 * (2 ** (attempt - 1)));
      continue;
    }
    return { ok: false, status: response.status, attempts: attempt, retryable, responseKind: parsed.kind, detail: parsed.detail };
  }

  return { ok: false, status: 0, attempts: ZEPTO_MAIL_MAX_ATTEMPTS, retryable: true, responseKind: "network_error", detail: "network_error" };
}