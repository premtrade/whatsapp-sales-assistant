import { isAllowedReturnUrl, allowedReturnHosts, normalizeHost } from '../utils/returnUrl';

describe('normalizeHost', () => {
  it('accepts bare hosts and origins', () => {
    expect(normalizeHost('waflo.vercel.app')).toBe('waflo.vercel.app');
    expect(normalizeHost('https://waflo.vercel.app')).toBe('waflo.vercel.app');
    expect(normalizeHost('https://waflo.vercel.app/')).toBe('waflo.vercel.app');
    expect(normalizeHost('HTTPS://WAFLO.VERCEL.APP')).toBe('waflo.vercel.app');
  });

  it('rejects empty and malformed values', () => {
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
    expect(normalizeHost('https://')).toBeNull();
  });
});

describe('allowedReturnHosts', () => {
  it('combines every config source and de-duplicates', () => {
    const hosts = allowedReturnHosts({
      ALLOWED_RETURN_HOSTS: 'https://waflo.vercel.app',
      FRONTEND_PUBLIC_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'https://waflo.vercel.app,https://waflo-app.vercel.app',
    } as NodeJS.ProcessEnv);

    expect(hosts).toEqual([
      'waflo.vercel.app',
      'localhost:3000',
      'waflo-app.vercel.app',
    ]);
  });

  it('is empty when nothing is configured', () => {
    expect(allowedReturnHosts({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe('isAllowedReturnUrl', () => {
  const env = {
    ALLOWED_RETURN_HOSTS: 'https://waflo.vercel.app',
    CORS_ORIGINS: 'https://waflo.vercel.app,http://localhost:3000',
  } as NodeJS.ProcessEnv;

  it('accepts the live site the customer is actually on', () => {
    expect(isAllowedReturnUrl('https://waflo.vercel.app/billing?success=1', env)).toBe(true);
  });

  it('rejects a host the deployment does not serve', () => {
    expect(isAllowedReturnUrl('https://evil.example.com/steal', env)).toBe(false);
    expect(isAllowedReturnUrl('https://waflo.com.evil.com/billing', env)).toBe(false);
  });

  it('accepts relative paths', () => {
    expect(isAllowedReturnUrl('/billing', env)).toBe(true);
  });

  it('rejects empty and malformed values', () => {
    expect(isAllowedReturnUrl('', env)).toBe(false);
    expect(isAllowedReturnUrl('not a url', env)).toBe(false);
  });

  it('falls back to localhost when nothing is configured', () => {
    const empty = {} as NodeJS.ProcessEnv;
    expect(isAllowedReturnUrl('http://localhost:3000/billing', empty)).toBe(true);
    expect(isAllowedReturnUrl('https://waflo.vercel.app/billing', empty)).toBe(false);
  });

  /**
   * The regression that motivated this: the server shipped with
   * ALLOWED_RETURN_HOSTS pointing at localhost, so the Upgrade button was
   * rejected in production with a 400 while every other screen looked fine.
   */
  it('rejects the live host when the allowlist only names localhost', () => {
    const misconfigured = {
      ALLOWED_RETURN_HOSTS: 'http://localhost:3000,http://localhost:5173',
      FRONTEND_PUBLIC_URL: 'http://localhost:3000',
    } as NodeJS.ProcessEnv;

    expect(isAllowedReturnUrl('https://waflo.vercel.app/billing?success=1', misconfigured)).toBe(false);
  });
});
