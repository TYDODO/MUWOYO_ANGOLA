export type VoiceTuning = {
  prosody: {
    speed: number;
    volume: number;
  };
  temperature: number;
  top_p: number;
  chunk_length: number;
  normalize: boolean;
};

export const DEFAULT_VOICE_TUNING: VoiceTuning = {
  prosody: { speed: 1, volume: 0 },
  temperature: 0.7,
  top_p: 0.7,
  chunk_length: 200,
  normalize: true,
};

export function parseVoiceTuning(value: unknown): VoiceTuning {
  if (value === undefined || value === null) return structuredClone(DEFAULT_VOICE_TUNING);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_voice_tuning");
  const record = value as Record<string, unknown>;
  const prosody = record.prosody;
  if (!prosody || typeof prosody !== "object" || Array.isArray(prosody)) throw new Error("invalid_voice_tuning");
  const prosodyRecord = prosody as Record<string, unknown>;
  const speed = Number(prosodyRecord.speed);
  const volume = Number(prosodyRecord.volume);
  const temperature = Number(record.temperature);
  const topP = Number(record.top_p);
  const chunkLength = Number(record.chunk_length);
  const normalize = record.normalize;
  if (
    !Number.isFinite(speed) || speed < 0.5 || speed > 2
    || !Number.isFinite(volume) || volume < -20 || volume > 20
    || !Number.isFinite(temperature) || temperature < 0.1 || temperature > 1
    || !Number.isFinite(topP) || topP < 0.1 || topP > 1
    || !Number.isInteger(chunkLength) || chunkLength < 100 || chunkLength > 300
    || typeof normalize !== "boolean"
  ) {
    throw new Error("invalid_voice_tuning");
  }
  return {
    prosody: { speed, volume },
    temperature,
    top_p: topP,
    chunk_length: chunkLength,
    normalize,
  };
}
