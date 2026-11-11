import { createClient } from "@supabase/supabase-js";

const defaultUrl = "https://ojctcqahhkdehtgffzvx.supabase.co";
const defaultKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY3RjcWFoaGtkZWh0Z2ZmenZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODE0MjksImV4cCI6MjEwOTk1NzQyOX0.xsne2kKDrJzYqop_x6miW1AGKztlHMTt_aeSrycNvRY";

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
