import {
  getSafeErrorTelemetry,
  logOperationalInfo,
  logOperationalError,
  sanitizeObservabilityProperties,
} from '@/utils/observability';

describe('sanitizeObservabilityProperties — filtre des champs sensibles', () => {
  it('supprime les champs nommés token / secret / password / email', () => {
    const result = sanitizeObservabilityProperties({
      token: 'jwt-eyJ...',
      access_token: 'a',
      refresh_token: 'r',
      secret: 's',
      password: 'p',
      email: 'user@example.com',
      authorization: 'Bearer x',
      cookie: 'sid=...',
      image_base64: 'base64-image-data',
      image_data: 'raw-image-data',
      user_id: 'u-1',
      status: 200,
    });

    expect(result).toEqual({ user_id: 'u-1', status: 200 });
  });

  it("supprime les valeurs non scalaires (objet, array)", () => {
    const result = sanitizeObservabilityProperties({
      // @ts-expect-error volontairement invalide pour le test
      details: { internal: 'sensible' },
      // @ts-expect-error idem
      payload: ['leaks'],
      ok: true,
    });

    expect(result).toEqual({ ok: true });
  });

  it("retourne undefined si toutes les propriétés sont filtrées", () => {
    const result = sanitizeObservabilityProperties({
      token: 'x',
      password: 'y',
    });
    expect(result).toBeUndefined();
  });
});

describe('getSafeErrorTelemetry', () => {
  it("extrait name/code/status/request_id sans inclure le payload de l'erreur", () => {
    const telemetry = getSafeErrorTelemetry({
      name: 'CustomError',
      code: 'route_missing',
      status: 404,
      request_id: 'req-abc',
      details: { secret_token: 'must-not-leak' },
    });

    expect(telemetry).toMatchObject({
      error_name: 'CustomError',
      code: 'route_missing',
      status: 404,
      request_id: 'req-abc',
    });
    expect(telemetry).not.toHaveProperty('details');
  });

  it("inclut le message d'une Error standard", () => {
    const telemetry = getSafeErrorTelemetry(new Error('boom'));
    expect(telemetry).toMatchObject({
      error_name: 'Error',
      message: 'boom',
    });
  });

  it("inclut le message provenant d'un record d'erreur Edge Function", () => {
    const telemetry = getSafeErrorTelemetry({
      name: 'Error',
      message: 'verification_rate_limited',
      code: 'verification_rate_limited',
      status: 429,
    });

    expect(telemetry).toMatchObject({
      error_name: 'Error',
      message: 'verification_rate_limited',
      code: 'verification_rate_limited',
      status: 429,
    });
  });

  it("préserve le message d'origine sans troncature dans getSafeErrorTelemetry", () => {
    const longMessage = 'x'.repeat(200);
    const telemetry = getSafeErrorTelemetry(new Error(longMessage));
    expect(telemetry.message).toBe(longMessage);
  });
});

describe('logOperationalInfo', () => {
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it("journalise une info sans propager d'image ou payload sensible", () => {
    logOperationalInfo('[Test] info', {
      image_base64: 'must-not-leak',
      payload: 'must-not-log',
      request_id: 'req-1',
      status: 200,
    });

    expect(consoleInfoSpy).toHaveBeenCalled();
    const serialized = JSON.stringify(consoleInfoSpy.mock.calls[0]);
    expect(serialized).toContain('req-1');
    expect(serialized).toContain('200');
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('must-not-log');
    expect(serialized).not.toContain('image_base64');
  });
});

describe('logOperationalError', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("ne propage pas un token utilisateur dans le log final", () => {
    logOperationalError('[Test] something failed', new Error('boom'), {
      access_token: 'jwt.secret.token',
      password: 'hunter2',
      user_id: 'u-1',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const args = consoleErrorSpy.mock.calls[0];
    const serialized = JSON.stringify(args);
    expect(serialized).not.toContain('jwt.secret.token');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).toContain('u-1');
  });

  it("inclut le message d'erreur dans la metadata loggée", () => {
    logOperationalError('[Test] something failed', new Error('boom message'));

    expect(consoleErrorSpy).toHaveBeenCalled();
    const [, metadata] = consoleErrorSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(metadata).toMatchObject({
      error_name: 'Error',
      message: 'boom message',
    });
  });

  it("tronque les messages d'erreur trop longs via sanitizeObservabilityProperties", () => {
    const longMessage = 'x'.repeat(200);
    logOperationalError('[Test] failure', new Error(longMessage));

    const [, metadata] = consoleErrorSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(typeof metadata.message).toBe('string');
    expect((metadata.message as string).length).toBeLessThanOrEqual(120);
    expect((metadata.message as string).endsWith('...')).toBe(true);
  });
});
