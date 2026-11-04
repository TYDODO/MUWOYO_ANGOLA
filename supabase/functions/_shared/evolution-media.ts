export function normalizeEvolutionMediaBase64(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const base64 = value.trim().replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  return base64 || null;
}

export function extractEvolutionMediaBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return normalizeEvolutionMediaBase64(payload);
  const response = payload as Record<string, unknown>;
  const data = response.data && typeof response.data === "object"
    ? response.data as Record<string, unknown>
    : null;
  return normalizeEvolutionMediaBase64(response.base64)
    || normalizeEvolutionMediaBase64(data?.base64)
    || null;
}
