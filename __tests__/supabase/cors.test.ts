function loadCorsHelpers(env: Record<string, string | undefined>) {
  jest.resetModules();
  (global as any).Deno = {
    env: {
      get: jest.fn((name: string) => env[name]),
    },
  };

  return require('@/supabase/functions/_shared/cors.ts') as typeof import('@/supabase/functions/_shared/cors');
}

describe('shared Supabase Edge Function CORS helpers', () => {
  it('refuses wildcard origins in production', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { validateCorsOrigin } = loadCorsHelpers({
      ALLOWED_ORIGINS: '*',
      SUPABASE_ENV: 'production',
    });

    try {
      const response = validateCorsOrigin(
        new Request('https://example.com/functions/v1/social-create-post', {
          headers: {
            Origin: 'https://evil.example',
          },
        }),
      );

      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toEqual({
        error: 'Origin not allowed',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        '[CORS] Refusing wildcard ALLOWED_ORIGINS in production.',
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('allows configured production origins and native calls without Origin', () => {
    const { validateCorsOrigin } = loadCorsHelpers({
      ALLOWED_ORIGINS: 'https://app.example',
      SUPABASE_ENV: 'production',
    });

    expect(
      validateCorsOrigin(
        new Request('https://example.com/functions/v1/social-create-post', {
          headers: {
            Origin: 'https://app.example',
          },
        }),
      ),
    ).toBeNull();
    expect(
      validateCorsOrigin(
        new Request('https://example.com/functions/v1/social-create-post'),
      ),
    ).toBeNull();
  });
});
