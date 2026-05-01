import { Linking } from 'react-native';

import {
  normalizeAppGeneratedImageUri,
  normalizeTrustedHttpsImageUri,
  normalizeTrustedImageUri,
  resolveSafeExternalUrl,
  resolveSafeReturnRoute,
  safeOpenExternalUrl,
} from '@/utils/urlSecurity';

const openURLSpy = jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

describe('urlSecurity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    openURLSpy.mockRestore();
  });

  it('allows only HTTPS URLs on trusted external hosts', () => {
    expect(resolveSafeExternalUrl('https://apps.apple.com/account/subscriptions')).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
    expect(
      resolveSafeExternalUrl(
        'https://play.google.com/store/apps/details?id=com.healthscan.app',
      ),
    ).toBe('https://play.google.com/store/apps/details?id=com.healthscan.app');

    expect(resolveSafeExternalUrl('http://play.google.com/store')).toBeNull();
    expect(resolveSafeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(resolveSafeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(resolveSafeExternalUrl('//play.google.com/store')).toBeNull();
    expect(resolveSafeExternalUrl('https://play.google.com.evil.test/store')).toBeNull();
  });

  it('opens only normalized safe external URLs', async () => {
    await expect(safeOpenExternalUrl('https://apps.apple.com/account/subscriptions')).resolves.toBe(
      true,
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions',
    );

    await expect(safeOpenExternalUrl('data:text/html,<script>')).resolves.toBe(false);
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
  });

  it('resolves returnTo only to allowlisted internal routes', () => {
    expect(resolveSafeReturnRoute('/analytics')).toBe('/analytics');
    expect(resolveSafeReturnRoute('/(tabs)')).toBe('/(tabs)');
    expect(resolveSafeReturnRoute('/(tabs)/coach')).toBe('/(tabs)/coach');
    expect(resolveSafeReturnRoute('/social-post?id=post-1')).toBe('/social-post?id=post-1');

    expect(resolveSafeReturnRoute('https://example.com')).toBeNull();
    expect(resolveSafeReturnRoute('//example.com')).toBeNull();
    expect(resolveSafeReturnRoute('javascript:alert(1)')).toBeNull();
    expect(resolveSafeReturnRoute('/unknown')).toBeNull();
    expect(resolveSafeReturnRoute('/(tabs)/analytics')).toBeNull();
    expect(resolveSafeReturnRoute('/settings\\evil')).toBeNull();
  });

  it('normalizes only app-generated local image files and trusted Supabase images', () => {
    expect(normalizeAppGeneratedImageUri(' file:///tmp/story.jpg ')).toBe(
      'file:///tmp/story.jpg',
    );
    expect(normalizeAppGeneratedImageUri('content://media/story.jpg')).toBeNull();
    expect(normalizeAppGeneratedImageUri('data:image/png;base64,abc')).toBeNull();

    expect(
      normalizeTrustedImageUri(
        'https://test.supabase.co/storage/v1/object/sign/avatars/user/avatar.jpg?token=abc',
      ),
    ).toBe(
      'https://test.supabase.co/storage/v1/object/sign/avatars/user/avatar.jpg?token=abc',
    );
    expect(normalizeTrustedImageUri('https://tracker.example.com/avatar.jpg')).toBeNull();
  });

  it('rejects XSS payloads in normalizeTrustedHttpsImageUri', () => {
    expect(
      normalizeTrustedHttpsImageUri('https://cdn.example.com/product.png'),
    ).toBe('https://cdn.example.com/product.png');

    expect(normalizeTrustedHttpsImageUri('javascript:alert(1)')).toBeNull();
    expect(normalizeTrustedHttpsImageUri('JAVASCRIPT:alert(1)')).toBeNull();
    expect(
      normalizeTrustedHttpsImageUri('data:image/svg+xml;base64,PHN2Zz4=='),
    ).toBeNull();
    expect(normalizeTrustedHttpsImageUri('http://cdn.example.com/x.png')).toBeNull();
    expect(normalizeTrustedHttpsImageUri('//cdn.example.com/x.png')).toBeNull();
    expect(
      normalizeTrustedHttpsImageUri('https://user:pass@cdn.example.com/x.png'),
    ).toBeNull();
    expect(
      normalizeTrustedHttpsImageUri('https://cdn.example.com:8080/x.png'),
    ).toBeNull();
    expect(normalizeTrustedHttpsImageUri('vbscript:msgbox(1)')).toBeNull();
    expect(normalizeTrustedHttpsImageUri('file:///etc/passwd')).toBeNull();
    expect(normalizeTrustedHttpsImageUri('content://media/img')).toBeNull();
    expect(normalizeTrustedHttpsImageUri(' \nhttps://cdn.example.com/x.png\t')).toBe(
      'https://cdn.example.com/x.png',
    );
    expect(normalizeTrustedHttpsImageUri('https://cdn.example.com\u0000/x.png')).toBeNull();
  });

  it('blocks classic XSS payload corpus across all url helpers', () => {
    const xssPayloads = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'javascript:void(0)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'jar:http://evil.com/x.jar!/',
      '\u0001javascript:alert(1)',
      'http://example.com\u0000.attacker.com',
    ];

    for (const payload of xssPayloads) {
      expect(resolveSafeExternalUrl(payload)).toBeNull();
      expect(resolveSafeReturnRoute(payload)).toBeNull();
      expect(normalizeTrustedImageUri(payload)).toBeNull();
      expect(normalizeTrustedHttpsImageUri(payload)).toBeNull();
    }
  });

  it('blocks remote file:// URIs except locally generated app paths', () => {
    expect(normalizeTrustedHttpsImageUri('file:///etc/passwd')).toBeNull();
    expect(resolveSafeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(resolveSafeReturnRoute('file:///etc/passwd')).toBeNull();
    // normalizeTrustedImageUri intentionally accepts local file:// URIs for
    // share-story preview images generated by the app itself.
    expect(normalizeTrustedImageUri('file:///tmp/story.jpg')).toBe(
      'file:///tmp/story.jpg',
    );
  });
});
