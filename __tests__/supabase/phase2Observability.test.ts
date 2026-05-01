import {
  logPhase2Error,
  summarizeWebhookResult,
} from '@/supabase/functions/_shared/phase2Observability';
import { Phase2HttpError } from '@/supabase/functions/_shared/phase2Errors';

describe('phase2Observability — SENSITIVE_KEY_PATTERN (S-08)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function captureLoggedMetadata(): Record<string, unknown> {
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const call = consoleErrorSpy.mock.calls[0];
    expect(call[0]).toBe('[test]');
    return call[1] as Record<string, unknown>;
  }

  it('redacts image_base64 / imageBase64 from log metadata', () => {
    logPhase2Error('[test]', new Error('boom'), {
      image_base64: 'AAAA'.repeat(1024),
      imageBase64: 'BBBB',
      scan_id: 'scan-id-1',
      user_id: 'user-id-1',
    });

    const metadata = captureLoggedMetadata();
    expect(metadata).not.toHaveProperty('image_base64');
    expect(metadata).not.toHaveProperty('imageBase64');
    expect(metadata).toMatchObject({
      scan_id: 'scan-id-1',
      user_id: 'user-id-1',
    });
  });

  it('redacts other image-binary aliases', () => {
    logPhase2Error('[test]', new Error('boom'), {
      image_bytes: 'XX',
      image_data: 'YY',
      image_blob: 'ZZ',
      image_buffer: 'WW',
      image_content: 'VV',
      'image-base64': 'UU',
      scan_id: 'scan-id-1',
    });

    const metadata = captureLoggedMetadata();
    expect(metadata).not.toHaveProperty('image_bytes');
    expect(metadata).not.toHaveProperty('image_data');
    expect(metadata).not.toHaveProperty('image_blob');
    expect(metadata).not.toHaveProperty('image_buffer');
    expect(metadata).not.toHaveProperty('image_content');
    expect(metadata).not.toHaveProperty('image-base64');
    expect(metadata).toMatchObject({ scan_id: 'scan-id-1' });
  });

  it('redacts plain "body" and "image" keys (exact matches)', () => {
    logPhase2Error('[test]', new Error('boom'), {
      body: 'whole-request-body',
      image: 'binary-data',
      scan_id: 'scan-id-1',
    });

    const metadata = captureLoggedMetadata();
    expect(metadata).not.toHaveProperty('body');
    expect(metadata).not.toHaveProperty('image');
    expect(metadata).toMatchObject({ scan_id: 'scan-id-1' });
  });

  it('does not over-redact safe identifiers ending in body-like substrings', () => {
    logPhase2Error('[test]', new Error('boom'), {
      anybody_count: 42,
      somebody_id: 'abc',
      scan_id: 'scan-id-1',
    });

    const metadata = captureLoggedMetadata();
    expect(metadata).toMatchObject({
      anybody_count: 42,
      somebody_id: 'abc',
      scan_id: 'scan-id-1',
    });
  });

  it('preserves Phase2HttpError code and status alongside redaction', () => {
    logPhase2Error('[test]', new Phase2HttpError(400, 'bad_input', 'oops'), {
      image_base64: 'AAAA',
      request_id: 'req-1',
    });

    const metadata = captureLoggedMetadata();
    expect(metadata).not.toHaveProperty('image_base64');
    expect(metadata).toMatchObject({
      code: 'bad_input',
      status: 400,
      request_id: 'req-1',
    });
  });

  it('summarizeWebhookResult never propagates raw text', () => {
    const summary = summarizeWebhookResult({
      status: 502,
      payload: { code: 'provider_down', message: 'no luck' },
      bodyPresent: true,
    });

    expect(summary).toMatchObject({
      webhook_status: 502,
      response_body_present: true,
      code: 'provider_down',
    });
    expect(summary).not.toHaveProperty('rawText');
    expect(summary).not.toHaveProperty('text');
    expect(summary).not.toHaveProperty('message');
  });
});
