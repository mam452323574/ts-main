import {
  mergeCoachProfileUpdates,
  normalizeCoachProfileUpdate,
  normalizePersistedInferredPersona,
} from '@/shared/coachProfileMemory';

describe('coachProfileMemory helpers', () => {
  it('normalizes the empty persisted object to null', () => {
    expect(normalizePersistedInferredPersona({})).toBeNull();
  });

  it('trims and dedupes structured profile updates', () => {
    expect(
      normalizeCoachProfileUpdate({
        detected_diet_signals: ['  protein  ', 'protein', '', 'fiber'],
        detected_strong_focus: 'nutrition',
        suggested_goals: ['  Hydration ', 'Hydration', ' Sleep '],
        suggested_persona_key: 'patient_calm',
      }),
    ).toEqual({
      detected_diet_signals: ['protein', 'fiber'],
      detected_strong_focus: 'nutrition',
      suggested_goals: ['Hydration', 'Sleep'],
      suggested_persona_key: 'patient_calm',
    });
  });

  it('caps persisted arrays and increments update_count only once per merge', () => {
    const merged = mergeCoachProfileUpdates(
      {
        detected_diet_signals: Array.from({ length: 8 }, (_, index) => `diet-${index}`),
        detected_strong_focus: 'health',
        suggested_goals: Array.from({ length: 6 }, (_, index) => `goal-${index}`),
        suggested_persona_key: 'gentle_supportive',
        last_updated_at: '2026-05-11T12:00:00.000Z',
        update_count: 2,
      },
      {
        detected_diet_signals: ['diet-1', 'diet-8', 'diet-9'],
        detected_strong_focus: 'body',
        suggested_goals: ['goal-1', 'goal-6', 'goal-7'],
        suggested_persona_key: 'strict_tough',
      },
      '2026-05-12T09:30:00.000Z',
    );

    expect(merged).toEqual({
      detected_diet_signals: [
        'diet-0',
        'diet-1',
        'diet-2',
        'diet-3',
        'diet-4',
        'diet-5',
        'diet-6',
        'diet-7',
      ],
      detected_strong_focus: 'body',
      suggested_goals: [
        'goal-0',
        'goal-1',
        'goal-2',
        'goal-3',
        'goal-4',
        'goal-5',
      ],
      suggested_persona_key: 'strict_tough',
      last_updated_at: '2026-05-12T09:30:00.000Z',
      update_count: 3,
    });
  });
});
