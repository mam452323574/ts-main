import { readOptionalServerEnv, readOptionalServerEnvList } from './phase2Env.ts';

export const WEBHOOK_ALLOWED_HOSTS_ENV_NAME = 'WEBHOOK_ALLOWED_HOSTS';
export const WEBHOOK_ALLOW_HTTP_ENV_NAME = 'WEBHOOK_ALLOW_HTTP';
export const WEBHOOK_ALLOW_PRIVATE_IPS_ENV_NAME = 'WEBHOOK_ALLOW_PRIVATE_IPS';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export type WebhookUrlValidationFailure =
  | 'invalid_url'
  | 'forbidden_protocol'
  | 'host_not_allowed'
  | 'allowlist_not_configured'
  | 'host_resolves_private'
  | 'host_dns_resolution_failed';

export type WebhookUrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: WebhookUrlValidationFailure; details?: Record<string, unknown> };

function ipv4ToBigInt(ip: string): bigint {
  const segments = ip.split('.');
  if (segments.length !== 4) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  let value = 0n;
  for (const segment of segments) {
    const octet = Number(segment);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      throw new Error(`Invalid IPv4 octet "${segment}" in ${ip}`);
    }
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

// S-02 — Plages IPv4 reservees / privees a bloquer apres resolution DNS.
// Couvre RFC 1918, loopback, link-local (AWS/Azure metadata 169.254.169.254),
// multicast, et "this network". On stocke en bigint pour comparer en une
// operation au lieu d'un parsing CIDR par requete.
const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [bigint, bigint]> = [
  [ipv4ToBigInt('10.0.0.0'), ipv4ToBigInt('10.255.255.255')],
  [ipv4ToBigInt('172.16.0.0'), ipv4ToBigInt('172.31.255.255')],
  [ipv4ToBigInt('192.168.0.0'), ipv4ToBigInt('192.168.255.255')],
  [ipv4ToBigInt('127.0.0.0'), ipv4ToBigInt('127.255.255.255')],
  [ipv4ToBigInt('169.254.0.0'), ipv4ToBigInt('169.254.255.255')],
  [ipv4ToBigInt('224.0.0.0'), ipv4ToBigInt('239.255.255.255')],
  [ipv4ToBigInt('0.0.0.0'), ipv4ToBigInt('0.255.255.255')],
  [ipv4ToBigInt('100.64.0.0'), ipv4ToBigInt('100.127.255.255')], // CGNAT
  [ipv4ToBigInt('192.0.0.0'), ipv4ToBigInt('192.0.0.255')], // IANA reserved
  [ipv4ToBigInt('192.0.2.0'), ipv4ToBigInt('192.0.2.255')], // TEST-NET-1
  [ipv4ToBigInt('198.18.0.0'), ipv4ToBigInt('198.19.255.255')], // benchmark
  [ipv4ToBigInt('198.51.100.0'), ipv4ToBigInt('198.51.100.255')], // TEST-NET-2
  [ipv4ToBigInt('203.0.113.0'), ipv4ToBigInt('203.0.113.255')], // TEST-NET-3
  [ipv4ToBigInt('240.0.0.0'), ipv4ToBigInt('255.255.255.255')], // reserved + broadcast
];

export function isPrivateIpv4(ip: string): boolean {
  let value: bigint;
  try {
    value = ipv4ToBigInt(ip);
  } catch {
    // Si la string ne se parse pas comme IPv4, on considere que c'est
    // suspect et on bloque.
    return true;
  }
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => value >= lo && value <= hi);
}

export function isPrivateIpv6(ip: string): boolean {
  // Deno resolveDns(.., 'AAAA') retourne les IPv6 en notation compacte/canonique.
  // On test :
  //   ::1                  → loopback
  //   ::ffff:127.0.0.1     → IPv4-mapped IPv6 (loopback)
  //   ::ffff:10.0.0.0/96   → IPv4-mapped IPv6 plage privee
  //   fc00::/7             → unique-local (fc.., fd..)
  //   fe80::/10            → link-local (fe80.. a febf..)
  //   ff00::/8             → multicast
  //   ::                   → unspecified
  //   2001:db8::/32        → documentation
  const lower = ip.trim().toLowerCase();
  if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 : ::ffff:a.b.c.d ou ::ffff:0:a.b.c.d
  const ipv4MappedMatch = lower.match(/^::ffff(?::[0-9a-f]{0,4})?:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (ipv4MappedMatch?.[1]) {
    return isPrivateIpv4(ipv4MappedMatch[1]);
  }

  // Plages dont la determination ne demande que le prefixe.
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('ff')) return true; // multicast ff00::/8
  if (lower.startsWith('2001:db8:')) return true; // documentation

  return false;
}

function readAllowPrivateIps(): boolean {
  const raw = readOptionalServerEnv(WEBHOOK_ALLOW_PRIVATE_IPS_ENV_NAME);
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function readAllowedHosts(): string[] | null {
  const list = readOptionalServerEnvList(WEBHOOK_ALLOWED_HOSTS_ENV_NAME);
  if (list === null) {
    return null;
  }

  const normalized = list
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function readAllowHttp(): boolean {
  const raw = readOptionalServerEnv(WEBHOOK_ALLOW_HTTP_ENV_NAME);
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function hostMatches(allowed: string, hostname: string) {
  if (allowed === hostname) {
    return true;
  }

  if (allowed.startsWith('*.')) {
    const suffix = allowed.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }

  return false;
}

export function validateWebhookUrl(rawUrl: string): WebhookUrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  const allowHttp = readAllowHttp();
  const isLocalhost = LOCALHOST_HOSTNAMES.has(parsed.hostname.toLowerCase());

  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:' && (allowHttp || isLocalhost)) {
      // OK : autorisé en dev local explicitement
    } else {
      return {
        ok: false,
        reason: 'forbidden_protocol',
        details: { protocol: parsed.protocol },
      };
    }
  }

  // En dev local (WEBHOOK_ALLOW_HTTP=true), bypass l'allowlist pour les
  // hostnames localhost/loopback. Couvre les variantes 127.0.0.1, ::1,
  // 0.0.0.0 sans forcer l'opérateur à les ajouter explicitement à
  // WEBHOOK_ALLOWED_HOSTS.
  if (isLocalhost && allowHttp) {
    return { ok: true, url: parsed };
  }

  const allowedHosts = readAllowedHosts();
  if (allowedHosts === null) {
    return { ok: false, reason: 'allowlist_not_configured' };
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const allowed of allowedHosts) {
    if (hostMatches(allowed, hostname)) {
      return { ok: true, url: parsed };
    }
  }

  return {
    ok: false,
    reason: 'host_not_allowed',
    details: { hostname },
  };
}

export function isWebhookUrlAllowed(rawUrl: string): boolean {
  return validateWebhookUrl(rawUrl).ok;
}

// S-02 — DNS resolver pluggable pour les tests unitaires. En prod on
// utilise Deno.resolveDns ; les tests injectent un faux resolver.
export type WebhookDnsResolver = (
  hostname: string,
  recordType: 'A' | 'AAAA',
) => Promise<string[]>;

let webhookDnsResolver: WebhookDnsResolver = async (hostname, recordType) => {
  try {
    return await Deno.resolveDns(hostname, recordType);
  } catch (_error) {
    // Deno leve NotFound / autre si pas de record du type demande.
    // On retourne un array vide ; les deux types sont essayes en parallele.
    return [];
  }
};

export function setWebhookDnsResolverForTests(resolver: WebhookDnsResolver | null) {
  if (resolver === null) {
    webhookDnsResolver = async (hostname, recordType) => {
      try {
        return await Deno.resolveDns(hostname, recordType);
      } catch (_error) {
        return [];
      }
    };
    return;
  }
  webhookDnsResolver = resolver;
}

// S-02 — Resoud le hostname et rejette les IPs privees / loopback / link-local.
// Pendant a `validateWebhookUrl` mais async : a appeler en defense-in-depth
// juste avant le fetch effectif, pour fermer la fenetre de DNS rebinding entre
// la validation et la requete.
export async function resolveWebhookHostPublic(
  hostname: string,
): Promise<WebhookUrlValidationResult | { ok: true; ipv4: string[]; ipv6: string[] }> {
  const normalizedHostname = hostname.trim().toLowerCase();

  // Bypass autorise explicitement en dev local (WEBHOOK_ALLOW_HTTP + localhost
  // ou WEBHOOK_ALLOW_PRIVATE_IPS=true). Cohérent avec validateWebhookUrl.
  if (LOCALHOST_HOSTNAMES.has(normalizedHostname) && readAllowHttp()) {
    return { ok: true, ipv4: [], ipv6: [] };
  }
  if (readAllowPrivateIps()) {
    return { ok: true, ipv4: [], ipv6: [] };
  }

  // Cas particulier : si le hostname est deja une IP literale, on saute la
  // resolution et on verifie directement. URL.hostname renvoie l'IPv6 entre
  // crochets sans les crochets ici (deja parse), mais on accepte les deux formats.
  const literalAsIpv4 = normalizedHostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  if (literalAsIpv4) {
    if (isPrivateIpv4(normalizedHostname)) {
      return {
        ok: false,
        reason: 'host_resolves_private',
        details: { hostname, ip: normalizedHostname, family: 'ipv4' },
      };
    }
    return { ok: true, ipv4: [normalizedHostname], ipv6: [] };
  }
  // IPv6 literal (entre crochets dans une URL → parsed.hostname le retire deja)
  if (normalizedHostname.includes(':')) {
    if (isPrivateIpv6(normalizedHostname)) {
      return {
        ok: false,
        reason: 'host_resolves_private',
        details: { hostname, ip: normalizedHostname, family: 'ipv6' },
      };
    }
    return { ok: true, ipv4: [], ipv6: [normalizedHostname] };
  }

  let aRecords: string[] = [];
  let aaaaRecords: string[] = [];
  try {
    [aRecords, aaaaRecords] = await Promise.all([
      webhookDnsResolver(normalizedHostname, 'A'),
      webhookDnsResolver(normalizedHostname, 'AAAA'),
    ]);
  } catch (error) {
    return {
      ok: false,
      reason: 'host_dns_resolution_failed',
      details: { hostname, error: error instanceof Error ? error.message : String(error) },
    };
  }

  if (aRecords.length === 0 && aaaaRecords.length === 0) {
    return {
      ok: false,
      reason: 'host_dns_resolution_failed',
      details: { hostname, message: 'no A or AAAA record' },
    };
  }

  for (const ip of aRecords) {
    if (isPrivateIpv4(ip)) {
      return {
        ok: false,
        reason: 'host_resolves_private',
        details: { hostname, ip, family: 'ipv4' },
      };
    }
  }
  for (const ip of aaaaRecords) {
    if (isPrivateIpv6(ip)) {
      return {
        ok: false,
        reason: 'host_resolves_private',
        details: { hostname, ip, family: 'ipv6' },
      };
    }
  }

  return { ok: true, ipv4: aRecords, ipv6: aaaaRecords };
}

// S-02 — Validation complete async : URL/protocol/allowlist + resolution DNS.
// A utiliser dans postWebhookJson juste avant le fetch.
export async function validateWebhookUrlWithDnsCheck(
  rawUrl: string,
): Promise<WebhookUrlValidationResult> {
  const baseResult = validateWebhookUrl(rawUrl);
  if (!baseResult.ok) {
    return baseResult;
  }

  const dnsResult = await resolveWebhookHostPublic(baseResult.url.hostname);
  if (!dnsResult.ok) {
    return dnsResult;
  }

  return baseResult;
}
