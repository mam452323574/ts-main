// S-02 — Tests pour la validation DNS et le blocage des IPs privees /
// loopback / link-local / multicast / reserves dans webhookHostAllowlist.ts.

import {
  isPrivateIpv4,
  isPrivateIpv6,
  resolveWebhookHostPublic,
  setWebhookDnsResolverForTests,
  validateWebhookUrlWithDnsCheck,
} from './webhookHostAllowlist.ts';

const WEBHOOK_HOST_ALLOWLIST_ENV_NAMES = [
  'WEBHOOK_ALLOWED_HOSTS',
  'WEBHOOK_ALLOW_HTTP',
  'WEBHOOK_ALLOW_PRIVATE_IPS',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function withAllowlistEnv(
  overrides: Partial<Record<(typeof WEBHOOK_HOST_ALLOWLIST_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();
  for (const envName of WEBHOOK_HOST_ALLOWLIST_ENV_NAMES) {
    originalValues.set(envName, Deno.env.get(envName));
    if (Object.prototype.hasOwnProperty.call(overrides, envName)) {
      Deno.env.set(envName, overrides[envName] ?? '');
    } else {
      Deno.env.set(envName, '');
    }
  }
  try {
    await action();
  } finally {
    for (const envName of WEBHOOK_HOST_ALLOWLIST_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

// =============================================================================
// isPrivateIpv4
// =============================================================================

Deno.test('isPrivateIpv4: detects RFC 1918 ranges', () => {
  assert(isPrivateIpv4('10.0.0.1'), '10.0.0.1 should be private');
  assert(isPrivateIpv4('10.255.255.255'), '10.255.255.255 should be private');
  assert(isPrivateIpv4('172.16.0.1'), '172.16.0.1 should be private');
  assert(isPrivateIpv4('172.31.255.255'), '172.31.255.255 should be private');
  assert(isPrivateIpv4('192.168.0.1'), '192.168.0.1 should be private');
  assert(isPrivateIpv4('192.168.255.255'), '192.168.255.255 should be private');
});

Deno.test('isPrivateIpv4: detects loopback', () => {
  assert(isPrivateIpv4('127.0.0.1'), '127.0.0.1 should be private (loopback)');
  assert(isPrivateIpv4('127.255.255.255'), '127.255.255.255 should be private');
});

Deno.test('isPrivateIpv4: detects AWS/Azure metadata link-local', () => {
  assert(isPrivateIpv4('169.254.169.254'), '169.254.169.254 should be private (AWS metadata)');
  assert(isPrivateIpv4('169.254.0.1'), 'Other link-local should be private');
});

Deno.test('isPrivateIpv4: detects multicast and reserved', () => {
  assert(isPrivateIpv4('224.0.0.1'), 'Multicast should be private');
  assert(isPrivateIpv4('239.255.255.255'), 'Multicast end should be private');
  assert(isPrivateIpv4('255.255.255.255'), 'Broadcast should be private');
  assert(isPrivateIpv4('0.0.0.0'), '0.0.0.0 should be private');
});

Deno.test('isPrivateIpv4: detects CGNAT and test ranges', () => {
  assert(isPrivateIpv4('100.64.0.1'), 'CGNAT should be private');
  assert(isPrivateIpv4('192.0.2.1'), 'TEST-NET-1 should be private');
  assert(isPrivateIpv4('198.51.100.1'), 'TEST-NET-2 should be private');
  assert(isPrivateIpv4('203.0.113.1'), 'TEST-NET-3 should be private');
  assert(isPrivateIpv4('198.18.0.1'), 'Benchmark range should be private');
});

Deno.test('isPrivateIpv4: accepts public IPs', () => {
  assertEquals(isPrivateIpv4('8.8.8.8'), false, '8.8.8.8 should be public');
  assertEquals(isPrivateIpv4('1.1.1.1'), false, '1.1.1.1 should be public');
  assertEquals(isPrivateIpv4('151.101.1.1'), false, 'Fastly CDN should be public');
  assertEquals(isPrivateIpv4('172.15.255.255'), false, 'Just outside 172.16/12 should be public');
  assertEquals(isPrivateIpv4('172.32.0.0'), false, 'Just outside 172.16/12 should be public');
});

Deno.test('isPrivateIpv4: malformed input is treated as suspect (private)', () => {
  assert(isPrivateIpv4('not.an.ip.address'), 'Malformed input should be considered private');
  assert(isPrivateIpv4('1.2.3'), 'Too few segments should be considered private');
  assert(isPrivateIpv4('1.2.3.4.5'), 'Too many segments should be considered private');
  assert(isPrivateIpv4('1.2.3.256'), 'Out-of-range octet should be considered private');
});

// =============================================================================
// isPrivateIpv6
// =============================================================================

Deno.test('isPrivateIpv6: detects loopback and unspecified', () => {
  assert(isPrivateIpv6('::1'), '::1 should be private');
  assert(isPrivateIpv6('::'), ':: should be private');
  assert(isPrivateIpv6('0:0:0:0:0:0:0:1'), 'Expanded loopback should be private');
});

Deno.test('isPrivateIpv6: detects IPv4-mapped private addresses', () => {
  assert(isPrivateIpv6('::ffff:127.0.0.1'), 'IPv4-mapped loopback should be private');
  assert(isPrivateIpv6('::ffff:10.0.0.1'), 'IPv4-mapped RFC 1918 should be private');
  assert(isPrivateIpv6('::ffff:169.254.169.254'), 'IPv4-mapped metadata should be private');
});

Deno.test('isPrivateIpv6: accepts IPv4-mapped public addresses', () => {
  assertEquals(isPrivateIpv6('::ffff:8.8.8.8'), false, 'IPv4-mapped 8.8.8.8 should be public');
});

Deno.test('isPrivateIpv6: detects unique-local (fc00::/7)', () => {
  assert(isPrivateIpv6('fc00::1'), 'fc00:: should be private');
  assert(isPrivateIpv6('fd12:3456:789a::1'), 'fd:: should be private');
});

Deno.test('isPrivateIpv6: detects link-local (fe80::/10)', () => {
  assert(isPrivateIpv6('fe80::1'), 'fe80:: should be private');
  assert(isPrivateIpv6('fe9b::1'), 'fe9b:: should be private');
  assert(isPrivateIpv6('feaf::1'), 'feaf:: should be private');
  assert(isPrivateIpv6('febf::1'), 'febf:: should be private');
});

Deno.test('isPrivateIpv6: detects multicast (ff00::/8)', () => {
  assert(isPrivateIpv6('ff02::1'), 'ff02:: should be private (multicast)');
  assert(isPrivateIpv6('ffff::1'), 'ffff:: should be private');
});

Deno.test('isPrivateIpv6: detects documentation range (2001:db8::/32)', () => {
  assert(isPrivateIpv6('2001:db8::1'), '2001:db8:: should be private');
});

Deno.test('isPrivateIpv6: accepts public addresses', () => {
  assertEquals(isPrivateIpv6('2606:4700:4700::1111'), false, 'Cloudflare DNS should be public');
  assertEquals(isPrivateIpv6('2001:4860:4860::8888'), false, 'Google DNS should be public');
});

// =============================================================================
// resolveWebhookHostPublic
// =============================================================================

Deno.test('resolveWebhookHostPublic: rejects literal private IPv4', async () => {
  await withAllowlistEnv({}, async () => {
    const result = await resolveWebhookHostPublic('127.0.0.1');
    assert(!result.ok, 'Loopback literal should be rejected');
    if (!result.ok) {
      assertEquals(result.reason, 'host_resolves_private', 'Reason should be host_resolves_private');
    }
  });
});

Deno.test('resolveWebhookHostPublic: rejects literal AWS metadata IP', async () => {
  await withAllowlistEnv({}, async () => {
    const result = await resolveWebhookHostPublic('169.254.169.254');
    assert(!result.ok, 'AWS metadata literal should be rejected');
  });
});

Deno.test('resolveWebhookHostPublic: rejects literal private IPv6 (::1)', async () => {
  await withAllowlistEnv({}, async () => {
    const result = await resolveWebhookHostPublic('::1');
    assert(!result.ok, '::1 literal should be rejected');
  });
});

Deno.test('resolveWebhookHostPublic: rejects hostname that resolves to private IPv4', async () => {
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['127.0.0.1'];
      return [];
    });
    try {
      const result = await resolveWebhookHostPublic('attacker.example.com');
      assert(!result.ok, 'Hostname resolving to loopback should be rejected');
      if (!result.ok) {
        assertEquals(result.reason, 'host_resolves_private', 'Reason should be host_resolves_private');
      }
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: rejects hostname that resolves to AWS metadata', async () => {
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['169.254.169.254'];
      return [];
    });
    try {
      const result = await resolveWebhookHostPublic('rebind.example.com');
      assert(!result.ok, 'Hostname resolving to AWS metadata should be rejected');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: rejects hostname that resolves to private IPv6', async () => {
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'AAAA') return ['fc00::1'];
      return [];
    });
    try {
      const result = await resolveWebhookHostPublic('v6.attacker.example.com');
      assert(!result.ok, 'IPv6 unique-local should be rejected');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: rejects hostname with no DNS records', async () => {
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async () => []);
    try {
      const result = await resolveWebhookHostPublic('nonexistent.example.com');
      assert(!result.ok, 'NXDOMAIN should be rejected');
      if (!result.ok) {
        assertEquals(result.reason, 'host_dns_resolution_failed', 'Reason should be host_dns_resolution_failed');
      }
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: accepts public IP resolution', async () => {
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['8.8.8.8'];
      return [];
    });
    try {
      const result = await resolveWebhookHostPublic('public.example.com');
      assert(result.ok, 'Public IP resolution should be accepted');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: rejects mixed result (1 public, 1 private)', async () => {
  // Defense-in-depth : si une seule IP est privee, on rejette pour eviter
  // qu'un attaquant retourne plusieurs IPs en esperant que le fetch tape sur
  // la privee.
  await withAllowlistEnv({}, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['8.8.8.8', '127.0.0.1'];
      return [];
    });
    try {
      const result = await resolveWebhookHostPublic('mixed.example.com');
      assert(!result.ok, 'Mixed public+private should be rejected');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('resolveWebhookHostPublic: bypasses check when WEBHOOK_ALLOW_PRIVATE_IPS=true', async () => {
  await withAllowlistEnv({ WEBHOOK_ALLOW_PRIVATE_IPS: 'true' }, async () => {
    const result = await resolveWebhookHostPublic('127.0.0.1');
    assert(result.ok, 'Private IP should be allowed when env flag is true');
  });
});

Deno.test('resolveWebhookHostPublic: bypasses check for localhost in dev mode', async () => {
  await withAllowlistEnv({
    WEBHOOK_ALLOW_HTTP: 'true',
  }, async () => {
    const result = await resolveWebhookHostPublic('localhost');
    assert(result.ok, 'localhost should be allowed in dev (WEBHOOK_ALLOW_HTTP=true)');
  });
});

// =============================================================================
// validateWebhookUrlWithDnsCheck
// =============================================================================

Deno.test('validateWebhookUrlWithDnsCheck: rejects URL when allowlist passes but DNS resolves private', async () => {
  await withAllowlistEnv({
    WEBHOOK_ALLOWED_HOSTS: 'attacker.example.com',
  }, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['10.0.0.1'];
      return [];
    });
    try {
      const result = await validateWebhookUrlWithDnsCheck('https://attacker.example.com/webhook');
      assert(!result.ok, 'Should reject when DNS resolves to private');
      if (!result.ok) {
        assertEquals(result.reason, 'host_resolves_private', 'Reason should be host_resolves_private');
      }
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('validateWebhookUrlWithDnsCheck: short-circuits if allowlist check fails', async () => {
  await withAllowlistEnv({
    WEBHOOK_ALLOWED_HOSTS: 'allowed.example.com',
  }, async () => {
    let dnsCalls = 0;
    setWebhookDnsResolverForTests(async () => {
      dnsCalls += 1;
      return ['8.8.8.8'];
    });
    try {
      const result = await validateWebhookUrlWithDnsCheck('https://other.example.com/webhook');
      assert(!result.ok, 'Should reject for not-in-allowlist');
      if (!result.ok) {
        assertEquals(result.reason, 'host_not_allowed', 'Reason should be host_not_allowed');
      }
      assertEquals(dnsCalls, 0, 'DNS resolution should be skipped when allowlist fails');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});

Deno.test('validateWebhookUrlWithDnsCheck: accepts when allowlist passes and DNS public', async () => {
  await withAllowlistEnv({
    WEBHOOK_ALLOWED_HOSTS: 'good.example.com',
  }, async () => {
    setWebhookDnsResolverForTests(async (_hostname, recordType) => {
      if (recordType === 'A') return ['151.101.1.1'];
      return [];
    });
    try {
      const result = await validateWebhookUrlWithDnsCheck('https://good.example.com/webhook');
      assert(result.ok, 'Should accept valid public host');
    } finally {
      setWebhookDnsResolverForTests(null);
    }
  });
});
