import {
  buildInvalidCoachResponseEntryValues,
  buildReadyCoachEntryValues,
  DEFAULT_COACH_DISCLAIMER,
  INVALID_COACH_RESPONSE_ERROR_CODE,
  resolveCoachPayload,
} from '@/supabase/functions/_shared/coachPayload';
import { Phase2HttpError } from '@/supabase/functions/_shared/phase2Errors';
import { getDefaultCoachDisclaimer } from '@/shared/coachCopy';

describe('coach payload helpers', () => {
  it('accepts a provider payload wrapped in data and produces ready entry values', () => {
    const providerPayload = {
      data: {
        title: 'Coach title',
        body: 'Coach body',
        disclaimer: 'Custom disclaimer',
        cta_label: 'Open plan',
        cta_route: '/coach-plan',
        source: 'coach-provider',
      },
    };

    const normalizedPayload = resolveCoachPayload(providerPayload);
    const readyValues = buildReadyCoachEntryValues({
      payload: providerPayload,
      normalizedResponse: normalizedPayload,
      locale: 'fr',
      usedFallback: false,
      generatedAt: '2026-04-12T18:00:00.000Z',
      expiresAt: '2026-04-13T18:00:00.000Z',
    });

    expect(normalizedPayload).toEqual({
      title: 'Coach title',
      body: 'Coach body',
      disclaimer: 'Custom disclaimer',
      cta_label: 'Open plan',
      cta_route: '/coach-plan',
      source: 'coach-provider',
      expires_at: null,
      response_version: 1,
      content: null,
    });
    expect(readyValues).toMatchObject({
      title: 'Coach title',
      body: 'Coach body',
      disclaimer: 'Custom disclaimer',
      cta_label: 'Open plan',
      cta_route: '/coach-plan',
      source: 'coach-provider',
      locale: 'fr',
      status: 'ready',
      error_code: null,
      generated_at: '2026-04-12T18:00:00.000Z',
      expires_at: '2026-04-13T18:00:00.000Z',
      response_payload_json: {
        fallback: false,
        source: 'coach-provider',
        status: 'ready',
      },
    });
  });

  it('keeps entry-wrapped payloads working for backward compatibility', () => {
    expect(
      resolveCoachPayload({
        entry: {
          title: 'Entry title',
          body: 'Entry body',
        },
      }),
    ).toEqual({
      title: 'Entry title',
      body: 'Entry body',
      disclaimer: DEFAULT_COACH_DISCLAIMER,
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_version: 1,
      content: null,
    });
  });

  it('keeps top-level payloads working for backward compatibility', () => {
    expect(
      resolveCoachPayload({
        title: 'Top level title',
        body: 'Top level body',
      }),
    ).toEqual({
      title: 'Top level title',
      body: 'Top level body',
      disclaimer: DEFAULT_COACH_DISCLAIMER,
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_version: 1,
      content: null,
    });
  });

  it('parses v2 structured payloads and persists content_json', () => {
    const providerPayload = {
      response_version: 2,
      title: 'Coach v2 title',
      body: 'Coach v2 body',
      disclaimer: 'Short disclaimer',
      content: {
        title: 'Coach v2 title',
        summary: 'Petit point sur ton dernier scan.',
        context_notes: ['fatigue plus marquée', 'hydratation correcte'],
        priorities: ['rattraper du sommeil'],
        action_steps: ['dormir 30 min de plus', 'boire un grand verre au lever'],
        warnings: [],
        encouragement: null,
        primary_metric_delta: {
          metric_key: 'fatigue_level',
          human_label: 'signes de fatigue',
          direction: 'up',
          magnitude: 'moderate',
          interpretation: 'negative',
        },
        data_gaps: [],
        confidence: 'medium',
      },
    };

    const normalizedPayload = resolveCoachPayload(providerPayload);

    expect(normalizedPayload.response_version).toBe(2);
    expect(normalizedPayload.content).not.toBeNull();
    expect(normalizedPayload.content?.summary).toBe(
      'Petit point sur ton dernier scan.',
    );
    expect(normalizedPayload.content?.context_notes).toEqual([
      'fatigue plus marquée',
      'hydratation correcte',
    ]);
    expect(normalizedPayload.content?.primary_metric_delta?.metric_key).toBe(
      'fatigue_level',
    );
    expect(normalizedPayload.content?.confidence).toBe('medium');

    const readyValues = buildReadyCoachEntryValues({
      payload: providerPayload,
      normalizedResponse: normalizedPayload,
      locale: 'fr',
      usedFallback: false,
      generatedAt: '2026-04-23T18:00:00.000Z',
      expiresAt: '2026-04-24T18:00:00.000Z',
    });

    expect(readyValues).toMatchObject({
      response_version: 2,
      content_json: expect.objectContaining({
        summary: 'Petit point sur ton dernier scan.',
      }),
    });
  });

  it('synthesises body from content when provider omits it', () => {
    const normalizedPayload = resolveCoachPayload({
      title: 'Coach v2',
      content: {
        title: 'Coach v2',
        summary: 'Résumé.',
        context_notes: ['note 1'],
        priorities: [],
        action_steps: ['action 1'],
        warnings: [],
        encouragement: null,
        primary_metric_delta: null,
        data_gaps: [],
        confidence: null,
      },
    });

    expect(normalizedPayload.response_version).toBe(2);
    expect(normalizedPayload.body).toContain('Résumé.');
    expect(normalizedPayload.body).toContain('• note 1');
    expect(normalizedPayload.body).toContain('✓ action 1');
  });

  it('uses the requested locale for default Coach disclaimers', () => {
    expect(
      resolveCoachPayload(
        {
          title: 'Titre Coach',
          body: 'Corps Coach',
        },
        'fr',
      ).disclaimer,
    ).toBe(getDefaultCoachDisclaimer('fr'));
  });

  it('builds an error update when a 2xx provider payload is missing required coach fields', () => {
    const providerPayload = {
      data: {
        body: 'Missing title',
        source: 'coach-provider',
      },
    };

    expect(() => resolveCoachPayload(providerPayload)).toThrow(Phase2HttpError);
    expect(() => resolveCoachPayload(providerPayload)).toThrow(
      'Coach webhook response must include title and body',
    );

    expect(
      buildInvalidCoachResponseEntryValues({
        payload: providerPayload,
        usedFallback: true,
        requestId: 'req-invalid',
        webhookStatus: 200,
      }),
    ).toEqual({
      status: 'error',
      error_code: INVALID_COACH_RESPONSE_ERROR_CODE,
      response_payload_json: {
        fallback: true,
        source: 'coach-provider',
        provider: 'n8n',
        status: 'error',
        error_code: INVALID_COACH_RESPONSE_ERROR_CODE,
        request_id: 'req-invalid',
        webhook_status: 200,
        wrapper_source: 'data',
        title_present: false,
        body_present: true,
      },
    });
  });
});
