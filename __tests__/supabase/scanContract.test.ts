import {
  SCAN_IMAGE_MAX_BYTES,
  buildAnalyzeScanRequest,
  buildCanonicalScanImagePath,
  buildCheckAndRecordScanRequest,
  getProviderScanType,
  hasJpegMagicBytes,
  normalizeScanAnalysisLanguage,
  resolveScanAnalysisLanguageContract,
} from '@/shared/scanContract';

describe('scan contract helpers', () => {
  it('maps app scan types to provider scan types consistently', () => {
    expect(getProviderScanType('health')).toBe('face');
    expect(getProviderScanType('body')).toBe('body');
    expect(getProviderScanType('nutrition')).toBe('nutrition');
    expect(getProviderScanType('super')).toBe('fat_distribution_scan_v2');
  });

  it('builds the canonical scan image path used by both client and server', () => {
    expect(
      buildCanonicalScanImagePath('user-123', 'scan-456')
    ).toBe('user-123/scans/scan-456.jpg');
  });

  it('builds the canonical reservation and analysis request bodies', () => {
    expect(buildCheckAndRecordScanRequest('health')).toEqual({
      scan_type: 'health',
    });
    expect(buildCheckAndRecordScanRequest('super', { checkOnly: true })).toEqual({
      scan_type: 'super',
      check_only: true,
    });
    expect(buildAnalyzeScanRequest('scan-456', 'nutrition', 'fr-FR')).toEqual({
      scan_id: 'scan-456',
      scan_type: 'nutrition',
      language: 'fr',
    });
    expect(buildAnalyzeScanRequest('scan-789', 'super')).toEqual({
      scan_id: 'scan-789',
      scan_type: 'super',
      language: 'fr',
    });
  });

  it('normalizes scan analysis language requests with French fallback', () => {
    expect(
      ['fr', 'en', 'es', 'de', 'it', 'pt'].map(normalizeScanAnalysisLanguage)
    ).toEqual(['fr', 'en', 'es', 'de', 'it', 'pt']);

    expect(normalizeScanAnalysisLanguage('fr-FR')).toBe('fr');
    expect(normalizeScanAnalysisLanguage('en_US')).toBe('en');
    expect(normalizeScanAnalysisLanguage('pt-BR')).toBe('pt');
    expect(normalizeScanAnalysisLanguage(undefined)).toBe('fr');
    expect(normalizeScanAnalysisLanguage('')).toBe('fr');
    expect(normalizeScanAnalysisLanguage(42)).toBe('fr');
    expect(normalizeScanAnalysisLanguage('nl')).toBe('fr');
  });

  it('resolves the webhook language contract for LLM prompts', () => {
    expect(resolveScanAnalysisLanguageContract('es-MX')).toEqual({
      language: 'es',
      locale: 'es',
      outputLanguage: 'Spanish',
    });
    expect(resolveScanAnalysisLanguageContract('unknown')).toEqual({
      language: 'fr',
      locale: 'fr',
      outputLanguage: 'French',
    });
  });

  describe('hasJpegMagicBytes (S-01)', () => {
    it('renvoie true pour un buffer JPEG valide (FF D8 FF)', () => {
      expect(hasJpegMagicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe(true);
      expect(hasJpegMagicBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    });

    it('accepte un ArrayBuffer en plus de Uint8Array', () => {
      const buffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
      expect(hasJpegMagicBytes(buffer)).toBe(true);
    });

    it('refuse les binaires non-JPEG (PDF, PNG, exécutables, polyglots)', () => {
      // PDF magic: %PDF
      expect(hasJpegMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
      // PNG magic: 89 50 4E 47
      expect(hasJpegMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
      // ELF / mach-o / random bytes
      expect(hasJpegMagicBytes(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe(false);
      expect(hasJpegMagicBytes(new Uint8Array([0xca, 0xfe, 0xba, 0xbe]))).toBe(false);
    });

    it('refuse les buffers trop courts', () => {
      expect(hasJpegMagicBytes(new Uint8Array([]))).toBe(false);
      expect(hasJpegMagicBytes(new Uint8Array([0xff]))).toBe(false);
      expect(hasJpegMagicBytes(new Uint8Array([0xff, 0xd8]))).toBe(false);
    });
  });

  describe('SCAN_IMAGE_MAX_BYTES (S-03)', () => {
    it('borne explicitement à 10 MB (cohérent avec le bucket file_size_limit)', () => {
      expect(SCAN_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    });
  });
});
