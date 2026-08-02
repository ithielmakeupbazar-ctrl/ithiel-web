import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(
  "https://bfuexiblfuqwykktltrp.supabase.co",
  "sb_publishable_8-do7RGW8-li-7d1BnAsXQ_RYsks6iy",
);

window.ithielSupabase = supabase;
