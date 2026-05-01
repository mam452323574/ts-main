import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { PremiumFeature } from '@/types';

export const PREMIUM_FEATURES_QUERY_KEY = ['premiumFeatures'] as const;

const fetchPremiumFeatures = async (): Promise<PremiumFeature[]> => {
  const { data, error } = await supabase
    .from('premium_features')
    .select('*')
    .eq('enabled', true)
    .order('category');

  if (error) throw error;
  return data || [];
};

export const usePremiumFeatures = () => {
  return useQuery<PremiumFeature[], Error>({
    queryKey: PREMIUM_FEATURES_QUERY_KEY,
    queryFn: fetchPremiumFeatures,
    staleTime: 1000 * 60 * 30, // 30 minutes - les features changent rarement
  });
};
