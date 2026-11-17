import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function syncWhatsAppLabels(
  admin: SupabaseClient,
  userId: string,
  contactId: string,
  rawLabels: unknown,
) {
  if (!Array.isArray(rawLabels)) return;

  const labels = new Map<string, string>();
  for (const rawLabel of rawLabels) {
    const name = typeof rawLabel === "string"
      ? rawLabel.trim()
      : rawLabel && typeof rawLabel === "object" && "name" in rawLabel && typeof rawLabel.name === "string"
      ? rawLabel.name.trim()
      : "";
    if (name) labels.set(name.toLocaleLowerCase(), name.slice(0, 100));
  }

  for (const name of labels.values()) {
    const { data: tag, error: tagError } = await admin
      .from("crm_tags")
      .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
      .select("id")
      .single();
    if (tagError) throw new Error(`whatsapp_label_save_failed:${tagError.message}`);

    const { error: linkError } = await admin
      .from("crm_contact_tags")
      .upsert(
        { user_id: userId, contact_id: contactId, tag_id: tag.id },
        { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
      );
    if (linkError) throw new Error(`whatsapp_label_link_failed:${linkError.message}`);
  }
}
