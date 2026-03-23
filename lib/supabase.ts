import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ezjyeyakrabzybszsquc.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6anlleWFrcmFienlic3pzcXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDY3NzAsImV4cCI6MjA4OTc4Mjc3MH0.JY-Z8dY1NLsorEI0ephuKvj7XTVxJy4WZAAaI0iBNX4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
