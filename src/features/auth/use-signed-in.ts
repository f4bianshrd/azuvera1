import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentSession } from "./remember";

/** Ist auf diesem Gerät jemand angemeldet? (für Startseite und öffentliche Kopfzeile) */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    void currentSession().then((s) => { if (alive) setSignedIn(!!s); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  return signedIn;
}
