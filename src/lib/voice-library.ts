const LANGUAGE_LABELS: Record<string, string> = {
  en: "Inglês",
  english: "Inglês",
  es: "Espanhol",
  spanish: "Espanhol",
  pt: "Português",
  portuguese: "Português",
  "pt-br": "Português do Brasil",
  "pt-pt": "Português de Portugal",
  fr: "Francês",
  french: "Francês",
  de: "Alemão",
  german: "Alemão",
  it: "Italiano",
  italian: "Italiano",
  ja: "Japonês",
  japanese: "Japonês",
  ko: "Coreano",
  korean: "Coreano",
  zh: "Chinês",
  chinese: "Chinês",
  ru: "Russo",
  russian: "Russo",
  ar: "Árabe",
  arabic: "Árabe",
};

const STYLE_LABELS: Record<string, string> = {
  warm: "acolhedor",
  friendly: "amigável",
  calm: "calmo",
  cheerful: "alegre",
  energetic: "enérgico",
  professional: "profissional",
  serious: "sério",
  narration: "narração",
  narrative: "narração",
  conversational: "conversacional",
  soft: "suave",
  deep: "grave",
  young: "jovem",
  mature: "maduro",
  natural: "natural",
  expressive: "expressivo",
  emotional: "emotivo",
  female: "feminina",
  woman: "feminina",
  male: "masculina",
  man: "masculina",
};

export function translateVoiceLanguages(languages: string[]): string[] {
  return [...new Set(languages.map((language) => LANGUAGE_LABELS[language.trim().toLowerCase()]).filter(Boolean))];
}

export function translateVoiceGender(gender: string | null, tags: string[]): string | null {
  const values = [gender || "", ...tags].join(" ").toLowerCase();
  if (/\b(female|woman|feminine|feminina)\b/.test(values)) return "Feminina";
  if (/\b(male|man|masculine|masculina)\b/.test(values)) return "Masculina";
  return null;
}

export function describeVoiceInPortuguese(languages: string[], gender: string | null, tags: string[]): string {
  const languagesPt = translateVoiceLanguages(languages);
  const styles = [...new Set(tags
    .map((tag) => STYLE_LABELS[tag.trim().toLowerCase()])
    .filter((style): style is string => Boolean(style)))];
  const details = [
    gender ? `Voz ${gender.toLowerCase()}` : "",
    languagesPt.length ? `Idioma: ${languagesPt.join(", ")}` : "",
    styles.length ? `Estilo: ${styles.join(", ")}` : "",
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "Voz pronta para atendimento e conteúdos em áudio.";
}
