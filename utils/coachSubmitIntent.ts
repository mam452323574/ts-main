import {
  FREE_QUESTION_PROMPT_TYPE,
  type CoachGenerationPromptType,
  type CoachPromptType,
} from '@/shared/coachPromptTypes';
import {
  normalizeCoachQuestionText,
  type CoachQuestionKey,
} from '@/shared/coachQuestions';

export type CoachSubmitQuestionSelectionMode = 'preset' | 'free_text';

export interface ResolveCoachSubmitIntentOptions {
  visiblePromptType: CoachPromptType;
  explicitGenerationPromptType?: CoachGenerationPromptType | null;
  questionSelectionMode: CoachSubmitQuestionSelectionMode;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
}

export interface ResolvedCoachSubmitIntent {
  promptType: CoachGenerationPromptType;
  questionKey: CoachQuestionKey | null;
  questionText: string | null;
}

export function resolveCoachSubmitIntent(
  options: ResolveCoachSubmitIntentOptions,
): ResolvedCoachSubmitIntent {
  const questionText = normalizeCoachQuestionText(options.questionText);
  const explicitGenerationPromptType =
    options.explicitGenerationPromptType ?? null;

  if (explicitGenerationPromptType) {
    return {
      promptType: explicitGenerationPromptType,
      questionKey: options.questionKey ?? null,
      questionText,
    };
  }

  if (options.questionSelectionMode === 'free_text' && questionText) {
    return {
      promptType: FREE_QUESTION_PROMPT_TYPE,
      questionKey: null,
      questionText,
    };
  }

  return {
    promptType: options.visiblePromptType,
    questionKey: options.questionKey ?? null,
    questionText,
  };
}
