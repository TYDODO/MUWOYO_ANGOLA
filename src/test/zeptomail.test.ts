import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ZEPTO_MAIL_ENDPOINT,
  isServiceRoleAuthorized,
  isValidEmailAddress,
  resolveZeptoMailEndpoint,
  sanitizeZeptoMailResponse,
  sendZeptoMail,
} from "../../supabase/functions/_shared/zeptomail";

const payload = {
  from: { address: "noreply@muwoyo.com", name: "MUWOYO" },
  to: [{ email_address: { address: "person@example.com", name: "Customer" } }],
  subject: "Confirm your email",
  htmlbody: "<p>Code: 123456</p>",
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Wait = (milliseconds: number) => Promise<void>;

describe("ZeptoMail transport", () => {
  it("uses the documented endpoint and normalizes the previously observed bare host", () => {
    expect(DEFAULT_ZEPTO_MAIL_ENDPOINT).toBe("https://cpaas.zoho.com/v1.1/email");
    expect(resolveZeptoMailEndpoint("cpaas.zoho.com")).toBe(DEFAULT_ZEPTO_MAIL_ENDPOINT);
    expect(resolveZeptoMailEndpoint("https://cpaas.zoho.com")).toBe(DEFAULT_ZEPTO_MAIL_ENDPOINT);
  });

  it("sends the documented authenticated payload and accepts a successful response", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response('{"request_id":"provider-id"}', { status: 200 }));
    const result = await sendZeptoMail({
      apiKey: "test-agent-key",
      payload,
      correlationId: "correlation-id",
      fetcher,
      wait: vi.fn(),
    });

    expect(result).toMatchObject({ ok: true, status: 200, attempts: 1, responseKind: "json" });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe(DEFAULT_ZEPTO_MAIL_ENDPOINT);
    expect(request?.headers).toMatchObject({
      Authorization: "Zoho-enczapikey test-agent-key",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({ ...payload, client_reference: "correlation-id" });
  });

  it("does not retry permanent provider errors and sanitizes personal and secret data", async () => {
    const wait = vi.fn<Wait>(async () => {});
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response(
      JSON.stringify({ error: "invalid_sender", address: "person@example.com", token: "test-agent-key" }),
      { status: 400 },
    ));
    const result = await sendZeptoMail({ apiKey: "test-agent-key", payload, correlationId: "correlation-id", fetcher, wait });

    expect(result).toMatchObject({ ok: false, status: 400, attempts: 1, retryable: false, responseKind: "json" });
    if (!result.ok) {
      expect("detail" in result && result.detail).toContain("invalid_sender");
      expect("detail" in result && result.detail).not.toContain("person@example.com");
      expect("detail" in result && result.detail).not.toContain("test-agent-key");
    }
    expect(wait).not.toHaveBeenCalled();
  });

  it("retries an empty 500 response with bounded progressive waits", async () => {
    const wait = vi.fn<Wait>(async () => {});
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response("\n", { status: 500 }));
    const result = await sendZeptoMail({ apiKey: "test-agent-key", payload, correlationId: "correlation-id", fetcher, wait });

    expect(result).toMatchObject({ ok: false, status: 500, attempts: 3, retryable: true, responseKind: "empty", detail: "empty_response" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([250, 500]);
    const attempts = fetcher.mock.calls.map(([, request]) => String(request?.body));
    expect(new Set(attempts).size).toBe(1);
    expect(JSON.parse(attempts[0]).client_reference).toBe("correlation-id");
  });

  it("treats provider authentication errors as permanent", async () => {
    const wait = vi.fn<Wait>(async () => {});
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }));
    const result = await sendZeptoMail({ apiKey: "test-agent-key", payload, correlationId: "correlation-id", fetcher, wait });

    expect(result).toMatchObject({ ok: false, status: 401, attempts: 1, retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("keeps an empty 2xx response successful without retrying", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response("", { status: 200 }));
    const result = await sendZeptoMail({ apiKey: "test-agent-key", payload, correlationId: "correlation-id", fetcher, wait: vi.fn() });

    expect(result).toMatchObject({ ok: true, status: 200, attempts: 1, responseKind: "empty" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports malformed error JSON without leaking OTPs or recipient addresses", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(new Response(
      "invalid response for person@example.com, code 123456",
      { status: 400 },
    ));
    const result = await sendZeptoMail({
      apiKey: "test-agent-key",
      payload,
      correlationId: "correlation-id",
      sensitiveValues: ["123456"],
      fetcher,
      wait: vi.fn(),
    });

    expect(result).toMatchObject({ ok: false, status: 400, retryable: false, responseKind: "invalid_json" });
    if (!result.ok) {
      expect("detail" in result && result.detail).toContain("invalid_json");
      expect("detail" in result && result.detail).toContain("[redacted-email]");
      expect("detail" in result && result.detail).not.toContain("123456");
    }
  });

  it("retries network failures before succeeding", async () => {
    const wait = vi.fn<Wait>(async () => {});
    const fetcher = vi.fn<Fetcher>()
      .mockRejectedValueOnce(new TypeError("temporary network error"))
      .mockResolvedValueOnce(new Response('{"request_id":"provider-id"}', { status: 200 }));
    const result = await sendZeptoMail({ apiKey: "test-agent-key", payload, correlationId: "correlation-id", fetcher, wait });

    expect(result).toMatchObject({ ok: true, status: 200, attempts: 2 });
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([250]);
  });

  it("sanitizes empty and malformed provider responses", () => {
    expect(sanitizeZeptoMailResponse("\n")).toEqual({ kind: "empty", detail: "empty_response" });
    expect(sanitizeZeptoMailResponse("not-json")).toEqual({ kind: "invalid_json", detail: "invalid_json: not-json" });
  });
});

describe("send-email authentication", () => {
  it("rejects missing, incorrect, and malformed service-role authorization", () => {
    expect(isServiceRoleAuthorized(null, "service-key")).toBe(false);
    expect(isServiceRoleAuthorized("Bearer wrong-key", "service-key")).toBe(false);
    expect(isServiceRoleAuthorized("service-key", "service-key")).toBe(false);
    expect(isServiceRoleAuthorized("Bearer service-key", "service-key")).toBe(true);
    expect(isServiceRoleAuthorized("Bearer service-key", "")).toBe(false);
  });
});

describe("email address validation", () => {
  it("accepts ordinary addresses and rejects missing or malformed addresses", () => {
    expect(isValidEmailAddress("person@example.com")).toBe(true);
    expect(isValidEmailAddress("person+tag@example.co.ao")).toBe(true);
    expect(isValidEmailAddress("")).toBe(false);
    expect(isValidEmailAddress("person@localhost")).toBe(false);
    expect(isValidEmailAddress("not-an-email")).toBe(false);
  });
});