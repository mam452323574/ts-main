import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_LANGUAGES = {
  fr: 'French',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
};

const SCAN_CASES = [
  { scanType: 'health', expectedType: 'face', image: 'face.jpg' },
  { scanType: 'body', expectedType: 'body', image: 'body.jpg' },
  { scanType: 'nutrition', expectedType: 'nutrition', image: 'nutrition.jpg' },
];

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }
  return values;
}

function required(values, argument, envName) {
  const value = values.get(argument) ?? process.env[envName];
  if (!value) throw new Error(`${argument} (or ${envName}) is required`);
  return value;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(timestamp, body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;
}

async function runCase({
  baseUrl,
  expectedType,
  imageBase64,
  language,
  scanType,
  secret,
  timeoutMs,
}) {
  const payload = {
    scanId: `smoke-${scanType}-${language}`,
    userId: 'smoke-scan-provider',
    scanType,
    language,
    locale: language,
    outputLanguage: OUTPUT_LANGUAGES[language],
    imageBase64,
  };
  const rawBody = JSON.stringify(payload);
  const requestTimestamp = new Date().toISOString();
  const startedAt = Date.now();
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-timestamp': requestTimestamp,
      'x-webhook-signature': sign(requestTimestamp, rawBody, secret),
    },
    body: rawBody,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const rawResponse = await response.text();
  const responseTimestamp = response.headers.get('x-webhook-response-timestamp');
  const responseSignature = response.headers.get('x-webhook-response-signature');
  const signatureValid = Boolean(
    responseTimestamp &&
    responseSignature &&
    safeEqual(
      responseSignature,
      sign(responseTimestamp, rawResponse, secret),
    ),
  );

  let parsed = null;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    // Keep response bodies out of smoke output.
  }

  const returnedType = parsed?.data?.scan_type ?? null;
  const success =
    response.ok &&
    parsed?.success === true &&
    returnedType === expectedType &&
    signatureValid;

  return {
    language,
    scan_type: scanType,
    expected_type: expectedType,
    returned_type: returnedType,
    http_status: response.status,
    success,
    response_signature_valid: signatureValid,
    duration_ms: Date.now() - startedAt,
  };
}

const values = parseArguments(process.argv.slice(2));
const baseUrl = required(values, '--url', 'SCAN_PROVIDER_WEBHOOK_URL');
const referenceDir = path.resolve(
  required(values, '--reference-dir', 'SCAN_PROVIDER_REFERENCE_DIR'),
);
const secret = required(
  values,
  '--hmac-secret',
  'PHASE2_WEBHOOK_HMAC_SECRET',
);
const timeoutMs = Number(values.get('--timeout-ms') ?? 90_000);
const languages = (values.get('--languages') ?? 'fr,en,es,de,it,pt')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter((value) => Object.hasOwn(OUTPUT_LANGUAGES, value));

if (languages.length === 0) throw new Error('No supported languages selected');

const images = Object.fromEntries(
  SCAN_CASES.map(({ image }) => [
    image,
    fs.readFileSync(path.join(referenceDir, image)).toString('base64'),
  ]),
);

const results = [];
for (const language of languages) {
  const languageResults = await Promise.all(
    SCAN_CASES.map((scanCase) => runCase({
      baseUrl,
      expectedType: scanCase.expectedType,
      imageBase64: images[scanCase.image],
      language,
      scanType: scanCase.scanType,
      secret,
      timeoutMs,
    })),
  );
  results.push(...languageResults);
  for (const result of languageResults) {
    console.log(JSON.stringify(result));
  }
}

const failures = results.filter((result) => !result.success);
console.log(JSON.stringify({
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
}));
if (failures.length > 0) process.exitCode = 1;
