import { resolveCoachSubmitIntent } from '@/utils/coachSubmitIntent';

describe('resolveCoachSubmitIntent', () => {
  it('routes typed manual free text to the hidden free_question prompt', () => {
    expect(
      resolveCoachSubmitIntent({
        visiblePromptType: 'latest_scan',
        questionSelectionMode: 'free_text',
        questionText: '  Comment rester motive cette semaine ?  ',
      }),
    ).toEqual({
      promptType: 'free_question',
      questionKey: null,
      questionText: 'Comment rester motive cette semaine ?',
    });
  });

  it('keeps preset submissions on their visible prompt even with suggestion text', () => {
    expect(
      resolveCoachSubmitIntent({
        visiblePromptType: 'weekly_plan',
        questionSelectionMode: 'preset',
        questionKey: 'weekly_plan__realistic_week',
        questionText:
        'Construis-moi une semaine realiste skincare + nutrition + sport.',
      }),
    ).toEqual({
      promptType: 'weekly_plan',
      questionKey: 'weekly_plan__realistic_week',
      questionText:
        'Construis-moi une semaine realiste skincare + nutrition + sport.',
    });
  });

  it('keeps scan-result question text on the explicit generation prompt', () => {
    expect(
      resolveCoachSubmitIntent({
        visiblePromptType: 'latest_scan',
        explicitGenerationPromptType: 'latest_scan_issue_resolution',
        questionSelectionMode: 'free_text',
        questionText: 'Que dois-je travailler apres ce scan ?',
      }),
    ).toEqual({
      promptType: 'latest_scan_issue_resolution',
      questionKey: null,
      questionText: 'Que dois-je travailler apres ce scan ?',
    });
  });

  it('keeps preset submissions when there is no free text', () => {
    expect(
      resolveCoachSubmitIntent({
        visiblePromptType: 'weekly_plan',
        questionSelectionMode: 'preset',
        questionKey: 'weekly_plan__realistic_week',
        questionText: null,
      }),
    ).toEqual({
      promptType: 'weekly_plan',
      questionKey: 'weekly_plan__realistic_week',
      questionText: null,
    });
  });
});
