import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface TallyConfig {
  tally_url: string;
  company_name: string;
  shop_name: string;
}

const LOCAL_STORAGE_KEY = 'sweet_pos_tally_url';
const LOCAL_COMPANY_KEY = 'sweet_pos_tally_company';

/**
 * Fetch the active Tally URL:
 * 1. Supabase (if configured)
 * 2. LocalStorage override
 * 3. Default ENV fallback
 */
export async function getActiveTallyConfig(): Promise<TallyConfig> {
  const defaultUrl =
    process.env.NEXT_PUBLIC_DEFAULT_TALLY_URL ||
    'https://year-wood-within-back.trycloudflare.com/?key=infra_15db9942eb4443d1';
  const defaultCompany = process.env.NEXT_PUBLIC_TALLY_COMPANY || 'Spj';
  const defaultShop = process.env.NEXT_PUBLIC_SHOP_NAME || 'Mithai Mahal Sweets';

  // Check localStorage for offline/manual quick override
  let localUrl = '';
  let localCompany = '';
  if (typeof window !== 'undefined') {
    localUrl = localStorage.getItem(LOCAL_STORAGE_KEY) || '';
    localCompany = localStorage.getItem(LOCAL_COMPANY_KEY) || '';
  }

  // Try fetching from Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tally_config')
        .select('*')
        .eq('id', 'primary')
        .single();

      if (!error && data && data.tally_url) {
        return {
          tally_url: localUrl || data.tally_url,
          company_name: localCompany || data.company_name || defaultCompany,
          shop_name: data.shop_name || defaultShop,
        };
      }
    } catch (e) {
      console.warn('Supabase fetch failed, falling back to local/env:', e);
    }
  }

  return {
    tally_url: localUrl || defaultUrl,
    company_name: localCompany || defaultCompany,
    shop_name: defaultShop,
  };
}

/**
 * Update the active Tally URL in Supabase and LocalStorage
 */
export async function updateActiveTallyConfig(
  newUrl: string,
  newCompany?: string
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_KEY, newUrl);
    if (newCompany) localStorage.setItem(LOCAL_COMPANY_KEY, newCompany);
  }

  if (supabase) {
    try {
      const { error } = await supabase
        .from('tally_config')
        .upsert(
          {
            id: 'primary',
            tally_url: newUrl,
            company_name: newCompany || 'Spj',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      return !error;
    } catch (e) {
      console.error('Failed to update Supabase config:', e);
      return false;
    }
  }

  return true;
}
