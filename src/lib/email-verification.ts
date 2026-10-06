import { supabase } from "@/integrations/supabase/client";

export type EmailVerificationError =
  | "invalid_code"
  | "expired_code"
  | "too_many_attempts"
  | "resend_cooldown"
  | "unauthorized"
  | "temporary_error"
  | "not_configured";

export type VerificationResult =
  | { success: true }
  | { success: false; error: EmailVerificationError };

type VerificationResponse = {
  success?: boolean;
  error?: EmailVerificationError;
};

function normalizeResponse(response: VerificationResponse | null): VerificationResult {
  if (response?.success === true) return { success: true };
  const error = response?.error;
  if (error && ["invalid_code", "expired_code", "too_many_attempts", "resend_cooldown", "unauthorized", "temporary_error", "not_configured"].includes(error)) {
    return { success: false, error };
  }
  return { success: false, error: "temporary_error" };
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
      return { success: false, error: error.message?.includes("401") ? "unauthorized" : "temporary_error" };
    }
    return normalizeResponse(data as VerificationResponse);
  } catch {
    return { success: false, error: "temporary_error" };
  }
}

/**
 * Kept separate so the future send-verification-code Edge Function can be
 * connected without changing the confirmation page.
 */
export async function resendVerificationCode(email?: string): Promise<VerificationResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-verification-code", {
      body: { email },
    });
    if (error) {
      console.error("send-verification-code failed", error);
      return { success: false, error: error.message?.includes("401") ? "unauthorized" : "temporary_error" };
    }
    return normalizeResponse(data as VerificationResponse);
  } catch {
    return { success: false, error: "temporary_error" };
  }
}