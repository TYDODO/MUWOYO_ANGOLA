export type ProfileFormState = {
  business_name: string;
  ai_name: string;
  business_description: string;
  ai_rules: string;
};

export const buildProfilePayload = ({
  userId,
  form,
  businessHours,
}: {
  userId: string;
  form: ProfileFormState;
  businessHours?: unknown;
}) => ({
  user_id: userId,
  ...form,
  ...(businessHours !== undefined ? { business_hours: businessHours } : {}),
});
