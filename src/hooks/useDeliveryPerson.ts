import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DeliveryPerson = {
  id: string;
  business_id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "pending" | "active" | "suspended" | "removed";
};

export function useDeliveryPerson() {
  const { user, loading: authLoading } = useAuth();
  const [deliveryPerson, setDeliveryPerson] = useState<DeliveryPerson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setDeliveryPerson(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void supabase.from("delivery_people")
      .select("id,business_id,user_id,name,email,phone,status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Could not load delivery account", error.message);
        setDeliveryPerson(data as DeliveryPerson | null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [authLoading, user]);

  return { deliveryPerson, loading };
}
