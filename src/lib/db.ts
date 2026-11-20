import { supabase, isSupabaseConfigured } from './supabase';

export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  fallbackValue: T
): Promise<{ data: T; error: string | null; isMissingTable: boolean }> {
  if (!isSupabaseConfigured) {
    return {
      data: fallbackValue,
      error: 'Supabase is not connected. Please enter your Supabase Project URL and Anon Key below.',
      isMissingTable: false
    };
  }

  try {
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000)
    );

    const result = await Promise.race([queryFn(), timeoutPromise]);

    if (result.error) {
      console.error('Supabase query error:', result.error);
      const msg = result.error.message || String(result.error);
      const isMissingTable = msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache');
      return { data: fallbackValue, error: msg, isMissingTable };
    }

    return { data: result.data !== null ? result.data : fallbackValue, error: null, isMissingTable: false };
  } catch (err: any) {
    console.error('Safe query exception:', err);
    const msg = err.message || 'Unknown error occurred';
    const isMissingTable = msg.includes('does not exist') || msg.includes('relation') || msg.includes('timeout');
    return { data: fallbackValue, error: msg, isMissingTable };
  }
}
