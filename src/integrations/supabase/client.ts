// Supabase client configuration — environment-driven with fail-fast.
// Values come from src/config/env.ts (see P0-6): no hard-coded production
// credentials are kept in source anymore.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/env';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);