// Normalize the incoming coach request into one stable context object.
// This node keeps persona, locale, payload, and scan context in a predictable shape for routing and prompting.
// The goal is to avoid duplicating parsing logic in downstream coach branches.

function safeParseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeInput(value) {
  const parsed = safeParseJson(value);
  return isRecord(parsed) ? parsed : null;
}

function candidateScore(candidate) {
  if (!isRecord(candidate)) return -1;
  let score = 0;
  if (isRecord(candidate.payload)) score += 10;
  if (candidate.success === true && isRecord(candidate.data) && typeof candidate.data.scan_type === 'string') score += 9;
  if (typeof candidate.persona_key === 'string') score += 4;
  if (isRecord(candidate.persona)) score += 3;
  if (typeof candidate.scan_type === 'string') score += 2;
  if (typeof candidate.locale === 'string') score += 2;
  if (candidate.output_contract_version !== undefined) score += 1;
  if (isRecord(candidate.body)) score -= 1;
  return score;
}

function pickInput(root) {
  const body = normalizeInput(root?.body);
  const data = normalizeInput(root?.data);
  const rootCandidate = normalizeInput(root);
  const candidates = [
    body,
    normalizeInput(body?.data),
    normalizeInput(body?.body),
    data,
    normalizeInput(data?.body),
    normalizeInput(data?.data),
    normalizeInput(rootCandidate?.entry),
    rootCandidate,
  ].filter(Boolean);

  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = candidateScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best ?? {};
}

function normalizeLocale(value) {
  if (typeof value !== 'string') return 'fr';
  const normalized = value.trim().slice(0, 2).toLowerCase();
  return normalized || 'fr';
}

function resolveLanguage(locale) {
  const normalized = normalizeLocale(locale);
  if (normalized === 'fr') return 'fr';
  if (normalized === 'en') return 'en';
  if (normalized === 'de') return 'de';
  if (normalized === 'it') return 'it';
  if (normalized === 'es') return 'es';
  if (normalized === 'pt') return 'pt';
  return 'fr';
}

const PERSONA_LABELS = {
  gentle_supportive: 'Gentle supportive',
  strict_tough: 'Strict tough',
  motivational_energetic: 'Motivational energetic',
  patient_calm: 'Patient calm',
  analytical_precise: 'Analytical precise',
  playful_light: 'Playful light',
};

function isNonEmptyObject(value) {
  return isRecord(value) && Object.keys(value).length > 0;
}

function hasScan(value) {
  if (Array.isArray(value)) return value.some(hasScan);
  if (!isRecord(value)) return false;
  if (typeof value.scan_id === 'string' && value.scan_id.trim()) return true;
  if (typeof value.scan_type === 'string' && value.scan_type.trim()) return true;
  if (typeof value.normalized_scan_type === 'string' && value.normalized_scan_type.trim()) return true;
  if (isNonEmptyObject(value.key_metrics)) return true;
  if (isNonEmptyObject(value.metrics)) return true;
  if (isNonEmptyObject(value.analysis_result_normalized)) return true;
  return Object.keys(value).some((key) => {
    if (['available', 'summary_flags', 'metric_deltas'].includes(key)) return false;
    return isRecord(value[key]) || Array.isArray(value[key]);
  });
}

function objectValues(value) {
  return isRecord(value) ? Object.values(value) : [];
}

function readShortText(value, maxLength = 240) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? Array.from(normalized).slice(0, maxLength).join('') : null;
}

function scanIdOf(scan) {
  if (!isRecord(scan)) return '';
  return readShortText(scan.scan_id, 120) || readShortText(scan.id, 120) || '';
}

function findScanById(scanId, candidates) {
  if (!scanId) return null;
  for (const candidate of candidates) {
    if (hasScan(candidate) && scanIdOf(candidate) === scanId) return candidate;
  }
  return null;
}

function normalizeScanIntent(value) {
  if (!isRecord(value)) return null;
  const severity = ['low', 'medium', 'high'].includes(value.severity) ? value.severity : null;
  const intent = {
    has_actionable_issue: value.has_actionable_issue === true,
    priority_metric: readShortText(value.priority_metric, 80),
    priority_label: readShortText(value.priority_label, 80),
    severity,
    reason: readShortText(value.reason, 260),
    scan_type: readShortText(value.scan_type, 80),
    prompt_type: readShortText(value.prompt_type, 80),
    question_text: readShortText(value.question_text, 200),
    user_facing_summary: readShortText(value.user_facing_summary, 280),
  };
  if (!intent.reason) delete intent.reason;
  if (!intent.scan_type) delete intent.scan_type;
  if (!intent.prompt_type) delete intent.prompt_type;

  if (
    !intent.has_actionable_issue &&
    !intent.priority_metric &&
    !intent.priority_label &&
    !intent.severity &&
    !intent.reason &&
    !intent.question_text &&
    !intent.user_facing_summary
  ) {
    return null;
  }
  return intent;
}

function formatScanIntentText(intent) {
  if (!isRecord(intent)) return 'SCAN_INTENT: none';
  return [
    'SCAN_INTENT:',
    'has_actionable_issue=' + (intent.has_actionable_issue === true ? 'true' : 'false'),
    'priority_metric=' + (intent.priority_metric || 'none'),
    'priority_label=' + (intent.priority_label || 'none'),
    'severity=' + (intent.severity || 'none'),
    'reason=' + (intent.reason || 'none'),
    'scan_type=' + (intent.scan_type || 'none'),
    'prompt_type=' + (intent.prompt_type || 'none'),
    'question_text=' + (intent.question_text || 'none'),
    'user_facing_summary=' + (intent.user_facing_summary || 'none'),
  ].join('\n');
}

function collectFlagsFromScan(scan, flags) {
  if (!isRecord(scan)) return;
  if (Array.isArray(scan.coach_relevant_flags)) {
    for (const flag of scan.coach_relevant_flags) {
      if (typeof flag === 'string' && flag.trim()) flags.add(flag.trim());
    }
  }
}

function collectFlags(payload) {
  const flags = new Set();
  collectFlagsFromScan(payload.latest_scan, flags);
  collectFlagsFromScan(payload.selected_scan, flags);
  if (Array.isArray(payload.recent_scans)) payload.recent_scans.forEach((scan) => collectFlagsFromScan(scan, flags));
  if (Array.isArray(payload.prior_scans)) payload.prior_scans.forEach((scan) => collectFlagsFromScan(scan, flags));
  objectValues(payload.latest_by_type).forEach((scan) => collectFlagsFromScan(scan, flags));
  return Array.from(flags);
}

function firstUsableScan(payload, latestByType, byType, recentScans, priorScans) {
  const latestTypeScans = objectValues(latestByType);
  const byTypeScans = objectValues(byType);
  const selectedScanId = readShortText(payload.selected_scan_id, 120) || scanIdOf(payload.selected_scan);
  const exactSelectedScan = findScanById(selectedScanId, [
    payload.latest_scan,
    payload.selected_scan,
    ...recentScans,
    ...priorScans,
    ...latestTypeScans,
    ...byTypeScans,
  ]);
  if (exactSelectedScan) return exactSelectedScan;
  if (hasScan(payload.selected_scan)) return payload.selected_scan;
  if (hasScan(payload.latest_scan)) return payload.latest_scan;
  if (recentScans.some(hasScan)) return recentScans.find(hasScan);
  if (latestTypeScans.some(hasScan)) return latestTypeScans.find(hasScan);
  if (priorScans.some(hasScan)) return priorScans.find(hasScan);
  if (byTypeScans.some(hasScan)) return byTypeScans.find(hasScan);
  return null;
}

function compactScanSummary(scan) {
  if (!isRecord(scan)) return 'none';
  const metrics = isRecord(scan.key_metrics)
    ? scan.key_metrics
    : isRecord(scan.metrics)
      ? scan.metrics
      : isRecord(scan.analysis_result_normalized)
        ? scan.analysis_result_normalized
        : {};
  return JSON.stringify({
    scan_id: scan.scan_id ?? null,
    scan_type: scan.scan_type ?? null,
    normalized_scan_type: scan.normalized_scan_type ?? scan.analysis_result_normalized?.scan_type ?? null,
    captured_at: scan.captured_at ?? null,
    metrics,
    raw_fallback_fields: isRecord(scan.raw_fallback_fields) ? scan.raw_fallback_fields : null,
    coach_relevant_flags: Array.isArray(scan.coach_relevant_flags) ? scan.coach_relevant_flags : [],
  });
}

function extractMetricsFromScan(scan) {
  if (!isRecord(scan)) return {};
  const flat = {};
  const sources = [scan.key_metrics, scan.metrics, scan.analysis_result_normalized, scan];
  for (const src of sources) {
    if (!isRecord(src)) continue;
    for (const key of Object.keys(src)) {
      if (key in flat) continue;
      const value = src[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        flat[key] = value;
      } else if (typeof value === 'string' && value.trim() && value.length < 80 && !['scan_id', 'scan_type', 'normalized_scan_type', 'captured_at'].includes(key)) {
        flat[key] = value.trim();
      }
    }
  }
  return flat;
}

const METRIC_INTERPRETATIONS = {
  face_score: { higher_is_better: true, scale: 100 },
  skin_quality_score: { higher_is_better: true, scale: 100 },
  hydration_level: { higher_is_better: true, scale: 100 },
  glow_index: { higher_is_better: true, scale: 10 },
  symmetry_percentage: { higher_is_better: true, scale: 100 },
  photogenic_score: { higher_is_better: true, scale: 10 },
  collagen_level: { higher_is_better: true, scale: 100 },
  skin_clarity_score: { higher_is_better: true, scale: 100 },
  under_eye_shadow_score: { higher_is_better: false, scale: 100 },
  under_eye_volume_score: { higher_is_better: false, scale: 100 },
  eye_openness_score: { higher_is_better: true, scale: 100 },
  complexion_redness_score: { higher_is_better: false, scale: 100 },
  pore_visibility_score: { higher_is_better: false, scale: 100 },
  skin_evenness_score: { higher_is_better: true, scale: 100 },
  skin_radiance_score: { higher_is_better: true, scale: 100 },
  lip_dryness_score: { higher_is_better: false, scale: 100 },
  forehead_smoothness_score: { higher_is_better: true, scale: 100 },
  t_zone_oiliness_score: { higher_is_better: false, scale: 100 },
  perceived_stress_level: { higher_is_better: false, scale: 100 },
  perceived_sleep_quality: { higher_is_better: true, scale: 100 },
  body_symmetry: { higher_is_better: true, scale: 100 },
  body_score: { higher_is_better: true, scale: 100 },
  posture_score: { higher_is_better: true, scale: 10 },
  waist_estimation_cm: { higher_is_better: false, scale: 150 },
  strength_index: { higher_is_better: true, scale: 100 },
  body_fat_percentage: { higher_is_better: false, scale: 50 },
  metabolic_age: { higher_is_better: false, scale: 100 },
  muscle_definition_score: { higher_is_better: true, scale: 100 },
  midsection_definition_score: { higher_is_better: true, scale: 100 },
  shoulder_alignment_score: { higher_is_better: true, scale: 100 },
  recovery_readiness_score: { higher_is_better: true, scale: 100 },
  upper_body_definition_score: { higher_is_better: true, scale: 100 },
  lower_body_definition_score: { higher_is_better: true, scale: 100 },
  arm_definition_score: { higher_is_better: true, scale: 100 },
  v_taper_score: { higher_is_better: true, scale: 100 },
  body_tension_indicator_score: { higher_is_better: false, scale: 100 },
  plate_health_score: { higher_is_better: true, scale: 100 },
  protein_grams: { higher_is_better: true, scale: 50 },
  satiety_index: { higher_is_better: true, scale: 10 },
  fiber_grams_estimate: { higher_is_better: true, scale: 30 },
  sugar_grams_estimate: { higher_is_better: false, scale: 100 },
  processing_level_score: { higher_is_better: false, scale: 100 },
  hydration_contribution_score: { higher_is_better: true, scale: 10 },
  sodium_level_score: { higher_is_better: false, scale: 10 },
  meal_balance_score: { higher_is_better: true, scale: 100 },
  inflammation_index_score: { higher_is_better: false, scale: 100 },
  color_diversity_score: { higher_is_better: true, scale: 10 },
  vegetable_portion_ratio: { higher_is_better: true, scale: 100 },
  protein_visibility_score: { higher_is_better: true, scale: 100 },
  whole_grain_indicator_score: { higher_is_better: true, scale: 100 },
  meal_freshness_score: { higher_is_better: true, scale: 100 },
  global_risk_score: { higher_is_better: false, scale: 100 },
};

const METRIC_LABELS = {
  face_score: 'score visage',
  skin_quality_score: 'qualite peau',
  hydration_level: 'hydratation percue',
  glow_index: 'eclat',
  fatigue_level: 'fatigue percue',
  symmetry_percentage: 'symetrie',
  photogenic_score: 'photogenie',
  collagen_level: 'collagene percu',
  skin_clarity_score: 'clarte peau',
  under_eye_shadow_score: 'ombres sous les yeux',
  under_eye_volume_score: 'volume sous les yeux',
  eye_openness_score: 'ouverture du regard',
  complexion_redness_score: 'rougeurs',
  pore_visibility_score: 'visibilite des pores',
  skin_evenness_score: 'regularite du teint',
  skin_radiance_score: 'radiance peau',
  lip_dryness_score: 'secheresse des levres',
  forehead_smoothness_score: 'lissage front',
  t_zone_oiliness_score: 'brillance zone T',
  perceived_stress_level: 'tension faciale',
  perceived_sleep_quality: 'qualite sommeil percue',
  body_symmetry: 'symetrie corporelle',
  body_score: 'score corps',
  posture_score: 'posture',
  waist_estimation_cm: 'tour de taille estime',
  strength_index: 'tonus',
  body_fat_percentage: 'masse grasse',
  metabolic_age: 'age metabolique estime',
  muscle_definition_score: 'definition musculaire',
  midsection_definition_score: 'definition sangle abdominale',
  shoulder_alignment_score: 'alignement epaules',
  recovery_readiness_score: 'recuperation visuelle',
  upper_body_definition_score: 'definition haut du corps',
  lower_body_definition_score: 'definition bas du corps',
  arm_definition_score: 'definition bras',
  v_taper_score: 'ratio epaules taille',
  body_tension_indicator_score: 'tension posturale',
  plate_health_score: 'qualite repas',
  protein_grams: 'proteines estimees',
  satiety_index: 'satiete',
  fiber_grams_estimate: 'fibres estimees',
  sugar_grams_estimate: 'sucres estimes',
  processing_level_score: 'niveau transformation',
  hydration_contribution_score: 'apport hydratation repas',
  sodium_level_score: 'niveau sodium',
  meal_balance_score: 'equilibre repas',
  inflammation_index_score: 'indice inflammation',
  color_diversity_score: 'diversite couleurs',
  vegetable_portion_ratio: 'part legumes',
  protein_visibility_score: 'proteines visibles',
  whole_grain_indicator_score: 'cereales completes',
  meal_freshness_score: 'fraicheur repas',
  global_risk_score: 'vigilance globale',
};

function resolveTriggerScanType(scan) {
  if (!isRecord(scan)) return null;
  const raw = typeof scan.normalized_scan_type === 'string' && scan.normalized_scan_type.trim()
    ? scan.normalized_scan_type
    : typeof scan.scan_type === 'string'
      ? scan.scan_type
      : null;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'health') return 'face';
  if (normalized === 'super_health' || normalized === 'super_health_v2') return 'super';
  return normalized;
}

function computeMetricTriggers(primaryScan) {
  const metrics = extractMetricsFromScan(primaryScan);
  const scanType = resolveTriggerScanType(primaryScan);
  const triggers = [];
  for (const key of Object.keys(metrics)) {
    const value = metrics[key];
    if (typeof value !== 'number') continue;
    const interp = METRIC_INTERPRETATIONS[key];
    if (!interp) continue;
    if (key === 'global_risk_score' && scanType !== 'super') continue;
    const pct = (value / interp.scale) * 100;
    let tier;
    let priority;
    if (interp.higher_is_better) {
      if (pct < 40) { tier = 'low'; priority = 'high'; }
      else if (pct < 70) { tier = 'medium'; priority = 'medium'; }
      else { tier = 'high'; priority = 'low'; }
    } else {
      if (pct > 70) { tier = 'high'; priority = 'high'; }
      else if (pct > 40) { tier = 'medium'; priority = 'medium'; }
      else { tier = 'low'; priority = 'low'; }
    }
    triggers.push({ metric: key, value: Math.round(value * 10) / 10, tier, priority_weight: priority, label: METRIC_LABELS[key] || key });
  }
  const order = { high: 0, medium: 1, low: 2 };
  triggers.sort((a, b) => order[a.priority_weight] - order[b.priority_weight]);
  return triggers.slice(0, 6);
}

function formatMetricTriggersText(triggers) {
  if (!Array.isArray(triggers) || triggers.length === 0) return 'METRIC_TRIGGERS: aucune metrique numerique exploitable';
  const parts = ['METRIC_TRIGGERS:'];
  for (const t of triggers) {
    parts.push('- ' + t.label + ' (' + t.metric + '): valeur=' + t.value + ' tier=' + t.tier + ' priorite=' + t.priority_weight);
  }
  return parts.join('\n');
}

function extractUserProfile(payload, input) {
  const sources = [payload && payload.user_profile, payload && payload.user_meta, payload && payload.profile, input && input.user_profile, input && input.user];
  let merged = {};
  for (const src of sources) {
    if (isRecord(src)) merged = Object.assign({}, src, merged);
  }
  const profile = {};
  if (typeof merged.age === 'number' && merged.age > 0 && merged.age < 120) profile.age = merged.age;
  if (typeof merged.age_band === 'string' && merged.age_band.trim()) profile.age_band = merged.age_band.trim();
  if (typeof merged.gender === 'string' && merged.gender.trim()) profile.gender = merged.gender.trim();
  if (Array.isArray(merged.goals)) profile.goals = merged.goals.filter((g) => typeof g === 'string' && g.trim()).slice(0, 5);
  const dietRaw = Array.isArray(merged.diet_constraints) ? merged.diet_constraints : (Array.isArray(merged.diet) ? merged.diet : null);
  if (dietRaw) profile.diet_constraints = dietRaw.filter((d) => typeof d === 'string' && d.trim()).slice(0, 5);
  if (Array.isArray(merged.allergens)) profile.allergens = merged.allergens.filter((a) => typeof a === 'string' && a.trim()).slice(0, 5);
  if (typeof merged.activity_level === 'string' && merged.activity_level.trim()) profile.activity_level = merged.activity_level.trim();
  return profile;
}

function formatUserProfileText(profile) {
  if (!profile || Object.keys(profile).length === 0) return 'USER_PROFILE: aucune metadonnee fournie';
  const parts = ['USER_PROFILE:'];
  if (profile.age || profile.age_band) parts.push('- age: ' + (profile.age_band || profile.age));
  if (profile.gender) parts.push('- gender: ' + profile.gender);
  if (Array.isArray(profile.goals) && profile.goals.length) parts.push('- goals: ' + profile.goals.join(', '));
  if (Array.isArray(profile.diet_constraints) && profile.diet_constraints.length) parts.push('- diet_constraints: ' + profile.diet_constraints.join(', '));
  if (Array.isArray(profile.allergens) && profile.allergens.length) parts.push('- allergens: ' + profile.allergens.join(', '));
  if (profile.activity_level) parts.push('- activity_level: ' + profile.activity_level);
  return parts.join('\n');
}


function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function extractInferredPersona(payload, input) {
  const sources = [payload && payload.inferred_persona, input && input.inferred_persona];
  for (const src of sources) {
    if (isRecord(src)) return src;
  }
  return null;
}

function extractCoachProfileMemory(payload, input) {
  const sources = [payload && payload.coach_profile_memory, input && input.coach_profile_memory];
  for (const src of sources) {
    if (isRecord(src)) return src;
  }
  return null;
}

function fieldMarker(field) {
  if (!isRecord(field)) return null;
  const value = typeof field.value === 'string' && field.value.trim() ? field.value.trim() : null;
  if (!value) return null;
  const source = field.source === 'declare' ? 'declare' : 'infere';
  const confidence = typeof field.confidence === 'string' ? field.confidence : null;
  const sampleCount = isFiniteNumber(field.sample_count) ? field.sample_count : null;
  const parts = [value, '(' + source];
  if (source === 'infere') {
    if (confidence) parts.push(', confiance ' + confidence);
    if (sampleCount !== null) parts.push(', ' + sampleCount + ' samples');
  }
  parts.push(')');
  return parts.join('');
}

function formatInferredPersonaText(persona) {
  if (!isRecord(persona)) return 'INFERRED_PERSONA: aucune persona inferee';
  const reliability = isRecord(persona.data_reliability) ? persona.data_reliability : null;
  const overall = reliability && isFiniteNumber(reliability.overall_percent) ? reliability.overall_percent : null;
  const header = overall !== null
    ? 'INFERRED_PERSONA (data_reliability: ' + overall + '%):'
    : 'INFERRED_PERSONA:';
  const parts = [header];

  if (reliability) {
    const comp = reliability.components || {};
    parts.push('- reliability components: sample_size=' + (comp.sample_size_percent ?? '?') + '%, recency=' + (comp.recency_percent ?? '?') + '%, consistency=' + (comp.consistency_percent ?? '?') + '%, image_quality=' + (comp.image_quality_percent ?? '?') + '%, coverage=' + (comp.coverage_percent ?? '?') + '%');
    if (Array.isArray(reliability.caveats) && reliability.caveats.length) {
      parts.push('- caveats: ' + reliability.caveats.join(', '));
    }
  }

  const apparentFields = [
    ['apparent_sex', persona.apparent_sex],
    ['apparent_age_range', persona.apparent_age_range],
    ['apparent_height_range', persona.apparent_height_range],
    ['apparent_weight_range', persona.apparent_weight_range],
    ['apparent_body_frame', persona.apparent_body_frame],
    ['apparent_fitness_level', persona.apparent_fitness_level],
    ['dominant_scan_focus', persona.dominant_scan_focus],
  ];
  for (const [key, field] of apparentFields) {
    const marker = fieldMarker(field);
    if (marker) parts.push('- ' + key + ': ' + marker);
  }

  if (Array.isArray(persona.dietary_signals) && persona.dietary_signals.length) {
    parts.push('- dietary_signals: ' + persona.dietary_signals.join(', '));
  }
  if (Array.isArray(persona.recurring_allergen_signals) && persona.recurring_allergen_signals.length) {
    parts.push('- recurring_allergen_signals: ' + persona.recurring_allergen_signals.join(', '));
  }
  if (persona.cycle_awareness_observed === true) parts.push('- cycle_awareness_observed: true');
  if (typeof persona.engagement_level === 'string') parts.push('- engagement_level: ' + persona.engagement_level);

  const temporal = isRecord(persona.temporal_patterns) ? persona.temporal_patterns : null;
  if (temporal) {
    const tparts = [];
    if (isFiniteNumber(temporal.last_scan_days_ago)) tparts.push('last_scan ' + temporal.last_scan_days_ago + 'j');
    if (isFiniteNumber(temporal.scans_last_7d)) tparts.push('scans/7d=' + temporal.scans_last_7d);
    if (typeof temporal.scan_frequency_label === 'string') tparts.push('frequency=' + temporal.scan_frequency_label);
    if (typeof temporal.preferred_time_of_day_key === 'string') tparts.push('time_of_day=' + temporal.preferred_time_of_day_key);
    if (typeof temporal.weekday_weekend_balance === 'string') tparts.push('balance=' + temporal.weekday_weekend_balance);
    if (isFiniteNumber(temporal.current_streak_days)) tparts.push('current_streak=' + temporal.current_streak_days + 'j');
    if (typeof temporal.dormancy_risk_level === 'string') tparts.push('dormancy=' + temporal.dormancy_risk_level);
    if (tparts.length) parts.push('- temporal_patterns: ' + tparts.join(', '));
  }

  const goal = isRecord(persona.goal_inference) ? persona.goal_inference : null;
  if (goal && typeof goal.primary_goal_key === 'string') {
    const conf = typeof goal.confidence === 'string' ? ' (confiance ' + goal.confidence + ')' : '';
    parts.push('- goal_inference: ' + goal.primary_goal_key + conf);
    if (Array.isArray(goal.motivation_indicators) && goal.motivation_indicators.length) {
      parts.push('  motivations: ' + goal.motivation_indicators.join(', '));
    }
  }

  const lifestyle = isRecord(persona.lifestyle_signature) ? persona.lifestyle_signature : null;
  if (lifestyle) {
    const lparts = [];
    if (typeof lifestyle.archetype_key === 'string') lparts.push('archetype=' + lifestyle.archetype_key);
    if (isFiniteNumber(lifestyle.stress_indicator_aggregate)) lparts.push('stress=' + lifestyle.stress_indicator_aggregate);
    if (isFiniteNumber(lifestyle.sleep_indicator_aggregate)) lparts.push('sleep=' + lifestyle.sleep_indicator_aggregate);
    if (isFiniteNumber(lifestyle.hydration_indicator_aggregate)) lparts.push('hydration=' + lifestyle.hydration_indicator_aggregate);
    if (isFiniteNumber(lifestyle.recovery_indicator_aggregate)) lparts.push('recovery=' + lifestyle.recovery_indicator_aggregate);
    if (lparts.length) parts.push('- lifestyle_signature: ' + lparts.join(', '));
  }

  const nutrition = isRecord(persona.nutrition_profile) ? persona.nutrition_profile : null;
  if (nutrition) {
    const nparts = [];
    if (isFiniteNumber(nutrition.dietary_diversity_score)) nparts.push('diversity=' + nutrition.dietary_diversity_score);
    if (Array.isArray(nutrition.cuisine_preference_keys) && nutrition.cuisine_preference_keys.length) nparts.push('cuisines=' + nutrition.cuisine_preference_keys.join('/'));
    if (Array.isArray(nutrition.cooking_method_preference_keys) && nutrition.cooking_method_preference_keys.length) nparts.push('cooking=' + nutrition.cooking_method_preference_keys.join('/'));
    if (typeof nutrition.dominant_meat_type_key === 'string') nparts.push('meat=' + nutrition.dominant_meat_type_key);
    if (isFiniteNumber(nutrition.processing_level_average)) nparts.push('processing_avg=' + nutrition.processing_level_average);
    if (isFiniteNumber(nutrition.sugar_intake_average_grams)) nparts.push('sugar_avg=' + nutrition.sugar_intake_average_grams + 'g');
    if (isFiniteNumber(nutrition.fiber_intake_average_grams)) nparts.push('fiber_avg=' + nutrition.fiber_intake_average_grams + 'g');
    if (isFiniteNumber(nutrition.protein_intake_average_grams)) nparts.push('protein_avg=' + nutrition.protein_intake_average_grams + 'g');
    if (nparts.length) parts.push('- nutrition_profile: ' + nparts.join(', '));
  }

  const trajectories = isRecord(persona.trajectories) ? persona.trajectories : null;
  if (trajectories) {
    const tparts = [];
    for (const key of Object.keys(trajectories)) {
      const entry = trajectories[key];
      if (!isRecord(entry) || typeof entry.direction !== 'string' || entry.direction === 'unknown') continue;
      const deltaStr = isFiniteNumber(entry.delta) ? ' (' + (entry.delta >= 0 ? '+' : '') + entry.delta + ')' : '';
      tparts.push(key + '=' + entry.direction + deltaStr);
    }
    if (tparts.length) parts.push('- trajectories: ' + tparts.join(', '));
  }

  const risk = isRecord(persona.risk_signals) ? persona.risk_signals : null;
  if (risk) {
    const rparts = [];
    if (typeof risk.cardiovascular_risk_level_key === 'string') rparts.push('cardio=' + risk.cardiovascular_risk_level_key);
    if (typeof risk.metabolic_risk_level_key === 'string') rparts.push('metabolic=' + risk.metabolic_risk_level_key);
    if (typeof risk.inflammation_risk_level_key === 'string') rparts.push('inflammation=' + risk.inflammation_risk_level_key);
    if (rparts.length) parts.push('- risk_signals: ' + rparts.join(', '));
    const drivers = [
      ...(Array.isArray(risk.cardiovascular_risk_drivers) ? risk.cardiovascular_risk_drivers : []),
      ...(Array.isArray(risk.metabolic_risk_drivers) ? risk.metabolic_risk_drivers : []),
      ...(Array.isArray(risk.inflammation_risk_drivers) ? risk.inflammation_risk_drivers : []),
    ];
    if (drivers.length) parts.push('  risk_drivers: ' + drivers.join(', '));
  }

  if (Array.isArray(persona.anomalies) && persona.anomalies.length) {
    parts.push('- anomalies: ' + persona.anomalies.join(', '));
  }

  const reco = isRecord(persona.coach_recommendations) ? persona.coach_recommendations : null;
  if (reco) {
    const rparts = [];
    if (Array.isArray(reco.recommended_emphasis) && reco.recommended_emphasis.length) rparts.push('emphasis=[' + reco.recommended_emphasis.join(',') + ']');
    if (Array.isArray(reco.topics_to_avoid) && reco.topics_to_avoid.length) rparts.push('avoid=[' + reco.topics_to_avoid.join(',') + ']');
    if (typeof reco.suggested_tone_key === 'string') rparts.push('tone=' + reco.suggested_tone_key);
    if (typeof reco.next_scan_focus_suggestion_key === 'string') rparts.push('next_scan_focus=' + reco.next_scan_focus_suggestion_key);
    if (rparts.length) parts.push('- coach_recommendations: ' + rparts.join(', '));
  }

  if (typeof persona.inferred_confidence === 'string') {
    parts.push('- inferred_confidence: ' + persona.inferred_confidence);
  }
  if (isFiniteNumber(persona.scan_count_total)) {
    parts.push('- scan_count_total: ' + persona.scan_count_total);
  }

  return parts.join('\n');
}

function formatCoachProfileMemoryText(memory) {
  if (!isRecord(memory)) return 'COACH_PROFILE_MEMORY: aucune memoire persistante';
  const parts = ['COACH_PROFILE_MEMORY:'];
  if (Array.isArray(memory.detected_diet_signals) && memory.detected_diet_signals.length) {
    parts.push('- detected_diet_signals: ' + memory.detected_diet_signals.join(', '));
  }
  if (typeof memory.detected_strong_focus === 'string') {
    parts.push('- detected_strong_focus: ' + memory.detected_strong_focus);
  }
  if (Array.isArray(memory.suggested_goals) && memory.suggested_goals.length) {
    parts.push('- suggested_goals: ' + memory.suggested_goals.join(', '));
  }
  if (typeof memory.suggested_persona_key === 'string') {
    parts.push('- suggested_persona_key: ' + memory.suggested_persona_key);
  }
  if (typeof memory.update_count === 'number' && Number.isFinite(memory.update_count)) {
    parts.push('- update_count: ' + Math.max(0, Math.floor(memory.update_count)));
  }
  if (typeof memory.last_updated_at === 'string' && memory.last_updated_at.trim()) {
    parts.push('- last_updated_at: ' + memory.last_updated_at);
  }
  return parts.length > 1 ? parts.join('\n') : 'COACH_PROFILE_MEMORY: aucune memoire persistante';
}

function deriveTemporalContext(input, payload) {
  const userLocal = isRecord(input && input.user_local_time) ? input.user_local_time : (isRecord(payload && payload.user_local_time) ? payload.user_local_time : null);
  let baseDate = new Date();
  let source = 'server_utc';
  if (userLocal && typeof userLocal.iso === 'string') {
    const parsed = new Date(userLocal.iso);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
      source = 'user_local';
    }
  }
  const hour = baseDate.getUTCHours();
  const dayOfWeek = baseDate.getUTCDay();
  let time_of_day;
  if (hour < 5) time_of_day = 'nuit';
  else if (hour < 11) time_of_day = 'matin';
  else if (hour < 14) time_of_day = 'midi';
  else if (hour < 18) time_of_day = 'apres-midi';
  else if (hour < 22) time_of_day = 'soir';
  else time_of_day = 'nuit';
  const is_weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const day_names = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return {
    iso: baseDate.toISOString(),
    day_of_week: day_names[dayOfWeek],
    hour,
    time_of_day,
    is_weekend,
    source,
  };
}

function formatTemporalText(t) {
  if (!t) return 'TEMPORAL_CONTEXT: indisponible';
  return [
    'TEMPORAL_CONTEXT:',
    '- moment: ' + t.time_of_day + ' (heure ' + t.hour + 'h)',
    '- jour: ' + t.day_of_week + (t.is_weekend ? ' (week-end)' : ' (semaine)'),
    '- iso: ' + t.iso,
    '- source: ' + t.source,
  ].join('\n');
}

function extractCoachMemory(payload, input) {
  const sources = [payload && payload.coach_memory, input && input.coach_memory];
  let mem = {};
  for (const src of sources) {
    if (isRecord(src)) mem = Object.assign({}, src, mem);
  }
  const out = {};
  if (Array.isArray(mem.prev_coach_responses)) {
    out.prev_coach_responses = mem.prev_coach_responses
      .filter((r) => isRecord(r))
      .slice(0, 5)
      .map((r) => ({
        title: typeof r.title === 'string' ? r.title.slice(0, 80) : null,
        priority: typeof r.priority === 'string' ? r.priority.slice(0, 80) : null,
        at: typeof r.at === 'string' ? r.at : null,
        coach_route: typeof r.coach_route === 'string' ? r.coach_route : null,
      }));
  }
  if (Array.isArray(mem.completed_actions)) {
    out.completed_actions = mem.completed_actions.filter((a) => typeof a === 'string' && a.trim()).slice(0, 10);
  }
  if (Array.isArray(mem.skipped_actions)) {
    out.skipped_actions = mem.skipped_actions.filter((a) => typeof a === 'string' && a.trim()).slice(0, 10);
  }
  if (typeof mem.streak_days === 'number' && mem.streak_days > 0) out.streak_days = Math.floor(mem.streak_days);
  return out;
}

function formatCoachMemoryText(mem) {
  if (!mem || Object.keys(mem).length === 0) return 'COACH_MEMORY: aucun historique fourni';
  const parts = ['COACH_MEMORY:'];
  if (typeof mem.streak_days === 'number') parts.push('- streak_days: ' + mem.streak_days);
  if (Array.isArray(mem.prev_coach_responses) && mem.prev_coach_responses.length) {
    parts.push('- reponses recentes du coach :');
    for (const r of mem.prev_coach_responses) {
      parts.push('  · ' + (r.coach_route || '?') + ' / priorite: ' + (r.priority || '?') + (r.at ? ' (' + r.at + ')' : ''));
    }
  }
  if (Array.isArray(mem.completed_actions) && mem.completed_actions.length) parts.push('- actions completees recemment : ' + mem.completed_actions.join(' | '));
  if (Array.isArray(mem.skipped_actions) && mem.skipped_actions.length) parts.push('- actions ignorees : ' + mem.skipped_actions.join(' | '));
  return parts.join('\n');
}

const ANALYSE_SCAN_TYPES = new Set(['face', 'body', 'nutrition']);

function normalizeAnalyseScanType(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return ANALYSE_SCAN_TYPES.has(normalized) ? normalized : null;
}

function firstTextValue(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function buildScanFromAnalyseEnvelope(input) {
  if (!isRecord(input) || input.success !== true || !isRecord(input.data)) return null;
  const data = input.data;
  const scanType = normalizeAnalyseScanType(data.scan_type);
  if (!scanType) return null;

  return {
    scan_id: firstTextValue([data.scan_id, input.scan_id, input.analysis_id, input.id]),
    scan_type: scanType,
    normalized_scan_type: scanType,
    captured_at: firstTextValue([data.captured_at, data.recorded_at, input.captured_at, input.recorded_at, input.created_at]),
    key_metrics: data,
    analysis_result_normalized: data,
    coach_relevant_flags: Array.isArray(data.coach_relevant_flags)
      ? data.coach_relevant_flags.filter((flag) => typeof flag === 'string' && flag.trim())
      : [],
  };
}

function buildPayload(input) {
  if (isRecord(input.payload)) return input.payload;

  const scan = buildScanFromAnalyseEnvelope(input);
  if (!scan) return {};

  const scanType = scan.normalized_scan_type;
  const payload = {
    latest_scan: scan,
    selected_scan: scan,
    recent_scans: [scan],
    latest_by_type: { [scanType]: scan },
    by_type: { [scanType]: [scan] },
    scan_count_7d: 1,
  };

  if (typeof input.prompt_type === 'string' && input.prompt_type.trim()) {
    payload.prompt_type = input.prompt_type.trim();
  }

  return payload;
}

const input = pickInput($json ?? {});
const payload = buildPayload(input);
const locale = normalizeLocale(input.locale);
const language = resolveLanguage(locale);
const personaKey =
  typeof input.persona_key === 'string' && input.persona_key.trim()
    ? input.persona_key.trim()
    : typeof input.persona?.key === 'string' && input.persona.key.trim()
      ? input.persona.key.trim()
      : 'gentle_supportive';
const latestByType = isRecord(payload.latest_by_type) ? payload.latest_by_type : {};
const byType = isRecord(payload.by_type) ? payload.by_type : {};
const recentScans = Array.isArray(payload.recent_scans) ? payload.recent_scans : [];
const priorScans = Array.isArray(payload.prior_scans) ? payload.prior_scans : [];
const hasAnyScan =
  hasScan(payload.latest_scan) ||
  hasScan(payload.selected_scan) ||
  hasScan(recentScans) ||
  hasScan(priorScans) ||
  hasScan(objectValues(latestByType)) ||
  hasScan(objectValues(byType)) ||
  (typeof payload.scan_count_7d === 'number' && payload.scan_count_7d > 0);
const selectedScanId = readShortText(payload.selected_scan_id, 120);
const scanIntent = normalizeScanIntent(payload.scan_intent);
const primaryScan = firstUsableScan(payload, latestByType, byType, recentScans, priorScans);
const comparison = isRecord(payload.comparison_to_previous)
  ? payload.comparison_to_previous
  : { available: false, metric_deltas: [] };
const trend = isRecord(payload.trend_summary)
  ? payload.trend_summary
  : { available: false, summary_flags: [], score_trend: null, metric_trends: [] };
const flags = collectFlags(payload);
const metricTriggers = computeMetricTriggers(primaryScan);
const userProfile = extractUserProfile(payload, input);
const temporalContext = deriveTemporalContext(input, payload);
const coachMemory = extractCoachMemory(payload, input);
const coachProfileMemory = extractCoachProfileMemory(payload, input);
const metricTriggersText = formatMetricTriggersText(metricTriggers);
const userProfileText = formatUserProfileText(userProfile);
const temporalText = formatTemporalText(temporalContext);
const memoryText = formatCoachMemoryText(coachMemory);
const inferredPersona = extractInferredPersona(payload, input);
const inferredPersonaText = formatInferredPersonaText(inferredPersona);
const coachProfileMemoryText = formatCoachProfileMemoryText(coachProfileMemory);
const coachContextText = [
  'SCAN_PRESENT: ' + (hasAnyScan ? 'true' : 'false'),
  'LANGUAGE: ' + language,
  'LOCALE: ' + locale,
  'PERSONA: ' + personaKey,
  'PROMPT_TYPE: ' + (typeof payload.prompt_type === 'string' ? payload.prompt_type : 'unknown'),
  'SCAN_COUNT_7D: ' + (typeof payload.scan_count_7d === 'number' ? payload.scan_count_7d : 0),
  'SELECTED_SCAN_ID: ' + (selectedScanId || 'none'),
  formatScanIntentText(scanIntent),
  'PRIMARY_SCAN: ' + compactScanSummary(primaryScan),
  'RECENT_SCANS_COUNT: ' + recentScans.length,
  'PRIOR_SCANS_COUNT: ' + priorScans.length,
  'COMPARISON_AVAILABLE: ' + (comparison.available === true ? 'true' : 'false'),
  'TREND_AVAILABLE: ' + (trend.available === true ? 'true' : 'false'),
  'COACH_FLAGS: ' + (flags.length ? flags.join(', ') : 'none'),
].join('\n');

return [
  {
    json: {
      locale,
      language,
      persona_key: personaKey,
      persona_label: PERSONA_LABELS[personaKey] ?? 'Coach',
      prompt_type:
        typeof payload.prompt_type === 'string' && payload.prompt_type.trim()
          ? payload.prompt_type.trim()
          : typeof input.prompt_type === 'string' && input.prompt_type.trim()
            ? input.prompt_type.trim()
            : null,
      output_contract_version: input.output_contract_version ?? 2,
      current_date: new Date().toISOString(),
      persona: isRecord(input.persona) ? input.persona : { key: personaKey },
      coach_context_text: coachContextText,
      coach_user_profile_text: userProfileText,
      coach_metric_triggers_text: metricTriggersText,
      coach_temporal_text: temporalText,
      coach_memory_text: memoryText,
      coach_inferred_persona_text: inferredPersonaText,
      coach_profile_memory_text: coachProfileMemoryText,
      inferred_persona: inferredPersona,
      coach_profile_memory: coachProfileMemory,
      user_profile: userProfile,
      temporal_context: temporalContext,
      coach_memory: coachMemory,
      metric_triggers: metricTriggers,
      selected_scan_id: selectedScanId || null,
      scan_intent: scanIntent,
      payload,
      scan_context: {
        has_any_scan: hasAnyScan,
        primary_scan: primaryScan,
        selected_scan_id: selectedScanId || null,
        scan_intent: scanIntent,
        latest_scan: payload.latest_scan ?? null,
        selected_scan: payload.selected_scan ?? null,
        recent_scans: recentScans,
        prior_scans: priorScans,
        latest_by_type: latestByType,
        by_type: byType,
        comparison_to_previous: comparison,
        trend_summary: trend,
        coach_relevant_flags: flags,
      },
    },
  },
];