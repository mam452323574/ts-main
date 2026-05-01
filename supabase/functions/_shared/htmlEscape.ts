const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

const HTML_ESCAPE_PATTERN = /[&<>"'`=/]/g;

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export function assertSafeNumericCode(value: string, options: { length: number }): string {
  const expectedPattern = new RegExp(`^\\d{${options.length}}$`);
  if (!expectedPattern.test(value)) {
    throw new Error(`Numeric code must be exactly ${options.length} digits`);
  }
  return value;
}
