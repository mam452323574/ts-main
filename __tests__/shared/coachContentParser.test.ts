import {
  deriveCoachConfidence,
  parseCoachStructuredContent,
  synthesizeCoachBody,
} from '@/shared/coachContentParser';

describe('coachContentParser', () => {
  it('returns null content when input is not a record', () => {
    expect(parseCoachStructuredContent(null).content).toBeNull();
    expect(parseCoachStructuredContent('').content).toBeNull();
    expect(parseCoachStructuredContent([]).content).toBeNull();
  });

  it('returns null content when no section is meaningful', () => {
    const result = parseCoachStructuredContent({
      title: 'Just a title',
    });

    expect(result.content).toBeNull();
    expect(result.version).toBe(1);
  });

  it('accepts a fully formed v2 payload', () => {
    const result = parseCoachStructuredContent({
      title: 'Ton dernier bilan',
      summary: "Voici ce qui ressort de ton dernier scan visage.",
      context_notes: ['fatigue plus marquée', 'hydratation correcte'],
      priorities: ['rattraper du sommeil'],
      action_steps: ['boire un grand verre', 'dormir 30 min de plus'],
      warnings: [],
      encouragement: 'Continue comme ça, ça va le faire.',
      primary_metric_delta: {
        metric_key: 'fatigue_level',
        human_label: 'signes de fatigue',
        direction: 'up',
        magnitude: 'moderate',
        interpretation: 'negative',
      },
      data_gaps: [],
      confidence: 'medium',
    });

    expect(result.version).toBe(2);
    expect(result.content).not.toBeNull();
    expect(result.content?.context_notes).toHaveLength(2);
    expect(result.content?.primary_metric_delta?.direction).toBe('up');
    expect(result.synthesizedBody).toContain('• fatigue plus marquée');
    expect(result.synthesizedBody).toContain('✓ dormir 30 min de plus');
  });

  it('truncates sections that exceed limits and filters empty items', () => {
    const result = parseCoachStructuredContent({
      title: 'A'.repeat(120),
      summary: 'S'.repeat(400),
      context_notes: Array.from({ length: 8 }).map((_, i) => `note ${i}`),
      priorities: [' ', '', null, 'real priority'],
      action_steps: null,
      warnings: [123 as unknown as string, 'real warning'],
      data_gaps: [],
      confidence: 'invalid-confidence',
    });

    expect(result.content).not.toBeNull();
    expect(result.content?.title.length).toBeLessThanOrEqual(80);
    expect(result.content?.summary.length).toBeLessThanOrEqual(280);
    expect(result.content?.context_notes).toHaveLength(3);
    expect(result.content?.priorities).toEqual(['real priority']);
    expect(result.content?.action_steps).toEqual([]);
    expect(result.content?.warnings).toEqual(['real warning']);
    expect(result.content?.confidence).toBeNull();
  });

  it('drops incomplete primary_metric_delta values', () => {
    const result = parseCoachStructuredContent({
      title: 'Title',
      summary: 'Summary',
      context_notes: ['ok'],
      primary_metric_delta: {
        metric_key: 'face_score',
        human_label: 'état général',
        direction: 'sideways',
        magnitude: 'moderate',
        interpretation: 'positive',
      },
    });

    expect(result.content?.primary_metric_delta).toBeNull();
  });

  it('uses fallback title when raw title is missing', () => {
    const result = parseCoachStructuredContent(
      {
        summary: 'Ton dernier scan montre une amélioration.',
        context_notes: ['plus en forme'],
      },
      { fallbackTitle: 'Bilan' },
    );

    expect(result.content?.title).toBe('Bilan');
  });

  it('deriveCoachConfidence respects explicit value', () => {
    expect(deriveCoachConfidence('high')).toBe('high');
    expect(deriveCoachConfidence('unknown', 5)).toBe('high');
  });

  it('deriveCoachConfidence infers from scan count', () => {
    expect(deriveCoachConfidence(null, 0)).toBeNull();
    expect(deriveCoachConfidence(null, 1)).toBe('low');
    expect(deriveCoachConfidence(null, 2)).toBe('medium');
    expect(deriveCoachConfidence(null, 4)).toBe('high');
  });

  it('synthesizeCoachBody produces a readable body', () => {
    const body = synthesizeCoachBody({
      title: 'T',
      summary: 'Phrase d’ouverture.',
      context_notes: ['note A'],
      priorities: ['priority A'],
      action_steps: ['action A'],
      warnings: [],
      encouragement: 'Tu gères.',
      primary_metric_delta: null,
      data_gaps: [],
      confidence: null,
    });

    expect(body).toContain('Phrase d’ouverture.');
    expect(body).toContain('• note A');
    expect(body).toContain('→ priority A');
    expect(body).toContain('✓ action A');
    expect(body.endsWith('Tu gères.')).toBe(true);
  });
});
