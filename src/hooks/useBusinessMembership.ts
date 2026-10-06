import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MemberRole = "owner" | "attendant" | null;
export type Membership = { id: string; business_id: string; user_id: string; role: MemberRole; status: string; name: string | null; email: string };

export function useBusinessMembership() {
  const { user, loading: authLoading } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setMembership(null); setPermissions([]); setOwnerUserId(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("business_members")
        .select("id,business_id,user_id,role,status,name,email,business_member_permissions(permission,enabled)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        const legacyOwner = (roles || []).some((row) => row.role === "admin");
        setMembership(legacyOwner ? { id: "legacy", business_id: "", user_id: user.id, role: "owner", status: "active", name: user.user_metadata?.full_name || null, email: user.email || "" } : null);
        setPermissions([]);
        setOwnerUserId(legacyOwner ? user.id : null);
      } else {
        setMembership(data);
        if (data.role === "owner") setOwnerUserId(user.id);
        else {
          const { data: owner } = await (supabase as any).from("business_members").select("user_id").eq("business_id", data.business_id).eq("role", "owner").eq("status", "active").maybeSingle();
          setOwnerUserId(owner?.user_id || null);
        }
        setPermissions((data.business_member_permissions || []).filter((item: { enabled: boolean }) => item.enabled).map((item: { permission: string }) => item.permission));
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const isOwner = membership?.role === "owner" && membership.status === "active";
  const hasPermission = (permission: string) => Boolean(isOwner || (membership?.role === "attendant" && membership.status === "active" && permissions.includes(permission)));
  return { membership, permissions, loading, isOwner, ownerUserId, hasPermission };
}
