import { createClient } from "@supabase/supabase-js";

const defaultUrl = "https://jfizzduvmzavtqwzqacy.supabase.co";
const defaultKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmaXp6ZHV2bXphdnRxd3pxYWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjQ2MTIsImV4cCI6MjEwMTU0MDYxMn0.9i77iYIYBEBDWzm528gVDpV3qgiiwkvE5MVTTKIG19s";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
