import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..');

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('App Review build hygiene', () => {
  it('keeps env backups and App Store credentials out of the EAS upload context', () => {
    const easIgnore = readProjectFile('.easignore');

    expect(easIgnore).toContain('.env*');
    expect(easIgnore).toContain('*.cloud-backup');
    expect(easIgnore).toContain('credentials*.json');
    expect(easIgnore).toContain('AuthKey_*.p8');
  });

  it('keeps the configured startup config error contact stable', () => {
    const startupGate = readProjectFile('components/StartupConfigGate.tsx');

    expect(startupGate).toContain('contact@selflens.org');
  });
});
