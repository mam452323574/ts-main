import {
  WEBHOOK_ALLOWED_HOSTS_ENV_NAME,
  WEBHOOK_ALLOW_HTTP_ENV_NAME,
  isWebhookUrlAllowed,
  validateWebhookUrl,
} from '@/supabase/functions/_shared/webhookHostAllowlist';

const ORIGINAL_DENO = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno;

function mockDenoEnv(values: Record<string, string | undefined>) {
  (globalThis as { Deno?: unknown }).Deno = {
    env: {
      get: (key: string) => values[key],
    },
  };
}

function clearDenoEnv() {
  if (ORIGINAL_DENO) {
    (globalThis as { Deno?: unknown }).Deno = ORIGINAL_DENO;
  } else {
    delete (globalThis as { Deno?: unknown }).Deno;
  }
}

describe('webhookHostAllowlist (S-02)', () => {
  afterEach(() => {
    clearDenoEnv();
  });

  it('refuse les URL non-HTTPS par défaut', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.example.com',
    });

    const result = validateWebhookUrl('http://n8n.example.com/hook');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('forbidden_protocol');
    }
  });

  it('refuse javascript: et autres protocoles dangereux', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.example.com',
    });

    expect(validateWebhookUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateWebhookUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateWebhookUrl('ftp://n8n.example.com/').ok).toBe(false);
  });

  it("refuse une URL invalide (qui n'est pas une URL)", () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.example.com',
    });

    const result = validateWebhookUrl('not-a-url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_url');
    }
  });

  it("refuse si l'allowlist n'est pas configurée (échec sécurisé)", () => {
    mockDenoEnv({});

    const result = validateWebhookUrl('https://n8n.example.com/hook');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('allowlist_not_configured');
    }
  });

  it('accepte un hostname listé exactement', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.basedjew.com,n8n.healthscan.cloud',
    });

    expect(isWebhookUrlAllowed('https://n8n.basedjew.com/webhook/scan')).toBe(true);
    expect(isWebhookUrlAllowed('https://n8n.healthscan.cloud/webhook/scan')).toBe(true);
  });

  it('refuse un hostname non listé', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.basedjew.com',
    });

    const result = validateWebhookUrl('https://attacker.com/hook');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('host_not_allowed');
      expect(result.details?.hostname).toBe('attacker.com');
    }
  });

  it("refuse 169.254.169.254 (AWS metadata) et autres hôtes interdits", () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.example.com',
    });

    expect(isWebhookUrlAllowed('https://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isWebhookUrlAllowed('https://internal.aws.local/secrets')).toBe(false);
  });

  it('supporte les wildcards de sous-domaine via *.host', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: '*.basedjew.com',
    });

    expect(isWebhookUrlAllowed('https://n8n.basedjew.com/hook')).toBe(true);
    expect(isWebhookUrlAllowed('https://primary.n8n.basedjew.com/hook')).toBe(true);
    // Le wildcard exige un sous-domaine — pas le domaine racine seul
    expect(isWebhookUrlAllowed('https://basedjew.com/hook')).toBe(false);
    // Pas de match cross-domain
    expect(isWebhookUrlAllowed('https://attacker-basedjew.com/hook')).toBe(false);
  });

  it('autorise localhost HTTP uniquement quand WEBHOOK_ALLOW_HTTP=true', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'localhost',
      [WEBHOOK_ALLOW_HTTP_ENV_NAME]: 'true',
    });

    expect(isWebhookUrlAllowed('http://localhost:9999/echo')).toBe(true);
    expect(isWebhookUrlAllowed('http://127.0.0.1:9999/echo')).toBe(true);
  });

  it('refuse HTTP en prod même si le hostname est allowlisté', () => {
    mockDenoEnv({
      [WEBHOOK_ALLOWED_HOSTS_ENV_NAME]: 'n8n.example.com',
    });

    expect(isWebhookUrlAllowed('http://n8n.example.com/hook')).toBe(false);
  });
});
