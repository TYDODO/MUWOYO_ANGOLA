import { supabase } from "@/integrations/supabase/client";

export type EmailVerificationError =
  | "invalid_code"
  | "expired_code"
  | "too_many_attempts"
  | "resend_cooldown"
  | "unauthorized"
  | "temporary_error"
  | "not_configured"
  | "invalid_email"
  | "delivery_failed";

export type VerificationResult =
  | { success: true }
  | { success: false; error: EmailVerificationError };

type VerificationResponse = {
  success?: boolean;
  error?: EmailVerificationError;
};

function normalizeResponse(response: VerificationResponse | null): VerificationResult {
  if (response?.success === true) return { success: true };
  if (isEmailVerificationError(response?.error)) return { success: false, error: response.error };
  return { success: false, error: "temporary_error" };
}

function isEmailVerificationError(value: unknown): value is EmailVerificationError {
  return typeof value === "string" && [
    "invalid_code",
    "expired_code",
    "too_many_attempts",
    "resend_cooldown",
    "unauthorized",
    "temporary_error",
    "not_configured",
    "invalid_email",
    "delivery_failed",
  ].includes(value);
}

async function getFunctionError(error: unknown): Promise<EmailVerificationError> {
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    const context = error.context;
    const body = await context.clone().json().catch(() => null) as { error?: unknown } | null;
    if (isEmailVerificationError(body?.error)) return body.error;
    if (context.status === 401) return "unauthorized";
  }
  if (error instanceof Error && error.message.includes("401")) return "unauthorized";
  return "temporary_error";
}

/**
 * The backend will own code generation, storage, expiry and validation.
 * This function deliberately does not validate or persist the OTP locally.
 */
export async function verifyEmailCode(code: string, email?: string): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-email-code", {
      body: { code, email },
    });
    if (error) {
      console.error("verify-email-code failed", error);
      return { success: false, error: await getFunctionError(error) };
    }
    return normalizeResponse(data as VerificationResponse);
  } catch {
    return { success: false, error: "temporary_error" };
  }
}

/** Sends a new OTP through the server-side verification flow. */
export async function resendVerificationCode(email?: string): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-verification-code", {
      body: { email },
    });
    if (error) {
      console.error("send-verification-code failed", error);
      return { success: false, error: await getFunctionError(error) };
    }
    return normalizeResponse(data as VerificationResponse);
  } catch {
    return { success: false, error: "temporary_error" };
  }
}