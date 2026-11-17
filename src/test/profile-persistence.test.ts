import { describe, expect, it } from "vitest";
import { buildProfilePayload } from "../lib/profile-persistence";

describe("business profile persistence payload", () => {
  it("contains only editable fields and preserves the configured business hours", () => {
    const businessHours = {
      monday: { open: true, start_time: "08:00", end_time: "17:00" },
    };
    const payload = buildProfilePayload({
      form: {
        business_name: "Muwoyo",
        ai_name: "Assistente",
        transfer_phone: "",
        ai_personality: "Atenciosa",
        business_description: "",
        ai_rules: "",
        appointment_duration_minutes: 30,
        accepts_appointments: true,
      },
      businessHours,
    });

    expect(payload).toMatchObject({
      business_name: "Muwoyo",
      ai_personality: "Atenciosa",
      business_hours: businessHours,
    });
    expect(payload).not.toHaveProperty("user_id");
  });
});
