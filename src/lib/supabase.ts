import { createClient } from '@supabase/supabase-js';

const getStoredConfig = () => {
  const storedUrl = localStorage.getItem('hotelstory_supabase_url');
  const storedKey = localStorage.getItem('hotelstory_supabase_key');
  const url = storedUrl || import.meta.env.VITE_SUPABASE_URL || '';
  const key = storedKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return { url, key };
};

const { url, key } = getStoredConfig();

export const isSupabaseConfigured = Boolean(
  url && 
  key && 
  !url.includes('placeholder') && 
  url.startsWith('http')
);

export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://xyzplaceholder.supabase.co',
  isSupabaseConfigured ? key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
);

export function updateSupabaseConfig(newUrl: string, newKey: string) {
  localStorage.setItem('hotelstory_supabase_url', newUrl.trim());
  localStorage.setItem('hotelstory_supabase_key', newKey.trim());
  window.location.reload();
}
