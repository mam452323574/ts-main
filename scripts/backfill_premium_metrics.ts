import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

type AppScanType = 'health' | 'body' | 'nutrition' | 'super';
type MetricsScanType = 'face' | 'body' | 'nutrition' | 'super';

interface ScanRow {
  id: string;
  user_id: string;
  scan_type: AppScanType;
  analysis_result: Record<string, unknown> | null;
  analyzed_at: string | null;
  created_at: string | null;
}

interface MetricsRow {
  user_id: string;
  scan_id: string;
  scan_type: MetricsScanType;
  recorded_at: string;
  body_score?: number | null;
  body_fat_percentage?: number | null;
  waist_estimation_cm?: number | null;
  body_metabolic_age?: number | null;
  body_strength_index?: number | null;
  face_score?: number | null;
  skin_quality_score?: number | null;
  fatigue_level?: number | null;
  face_symmetry_percentage?: number | null;
  face_energy_score?: number | null;
  plate_health_score?: number | null;
  calories_estimate?: number | null;
  protein_grams?: number | null;
  nutrition_satiety_index?: number | null;
  global_risk_score?: number | null;
}

const PAGE_SIZE = 500;

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || typeof value === 'undefined' || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildMetricsRow(scan: ScanRow): MetricsRow | null {
  if (!scan.analysis_result || typeof scan.analysis_result !== 'object') {
    return null;
  }

  const result = scan.analysis_result as Record<string, unknown>;
  const resultType = result.scan_type;
  const recordedAt = scan.analyzed_at ?? scan.created_at ?? new Date().toISOString();

  const baseRow: MetricsRow = {
    user_id: scan.user_id,
    scan_id: scan.id,
    scan_type: 'super',
    recorded_at: recordedAt,
  };

  if (resultType === 'face') {
    return {
      ...baseRow,
      scan_type: 'face',
      face_score: toNullableNumber(result.face_score),
      skin_quality_score: toNullableNumber(result.skin_quality_score),
      fatigue_level: toNullableNumber(result.fatigue_level),
      face_symmetry_percentage: toNullableNumber(result.symmetry_percentage),
      face_energy_score: toNullableNumber(result.energy_score),
    };
  }

  if (resultType === 'body') {
    return {
      ...baseRow,
      scan_type: 'body',
      body_score: toNullableNumber(result.body_score),
      body_fat_percentage: toNullableNumber(result.body_fat_percentage),
      waist_estimation_cm: toNullableNumber(result.waist_estimation_cm),
      body_metabolic_age: toNullableNumber(result.metabolic_age),
      body_strength_index: toNullableNumber(result.strength_index),
    };
  }

  if (resultType === 'nutrition') {
    return {
      ...baseRow,
      scan_type: 'nutrition',
      plate_health_score: toNullableNumber(result.plate_health_score),
      calories_estimate: toNullableNumber(result.calories_estimate),
      protein_grams: toNullableNumber(result.protein_grams),
      nutrition_satiety_index: toNullableNumber(result.satiety_index),
    };
  }

  if (resultType === 'super_health_v2') {
    return {
      ...baseRow,
      scan_type: 'super',
      global_risk_score: toNullableNumber(result.global_risk_score),
    };
  }

  return null;
}

async function main() {
  loadDotEnvFile();

  const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let from = 0;
  let processedRows = 0;
  let skippedRows = 0;

  console.log('[backfill_premium_metrics] Starting backfill...');

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('scans')
      .select('id, user_id, scan_type, analysis_result, analyzed_at, created_at')
      .not('analysis_result', 'is', null)
      .not('analyzed_at', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const scans = (data ?? []) as ScanRow[];
    if (scans.length === 0) {
      break;
    }

    const metricsBatch = scans
      .map((scan) => buildMetricsRow(scan))
      .filter((row): row is MetricsRow => {
        if (!row) {
          skippedRows += 1;
          return false;
        }

        return true;
      });

    if (metricsBatch.length > 0) {
      const { error: upsertError } = await supabase
        .from('scan_metrics')
        .upsert(metricsBatch, { onConflict: 'scan_id' });

      if (upsertError) {
        throw upsertError;
      }
    }

    processedRows += metricsBatch.length;
    console.log(
      `[backfill_premium_metrics] Processed ${processedRows} metrics rows so far (skipped ${skippedRows}).`
    );

    if (scans.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  console.log(
    `[backfill_premium_metrics] Backfill complete. Upserted ${processedRows} rows, skipped ${skippedRows}.`
  );
}

main().catch((error) => {
  console.error('[backfill_premium_metrics] Failed:', error);
  process.exitCode = 1;
});
