import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

describe('loadConfig production guards', () => {
  const savedPublicUrl = process.env.PUBLIC_URL;
  const savedSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    // Restore whatever the ambient environment had, so these tests don't leak into others.
    if (savedPublicUrl === undefined) delete process.env.PUBLIC_URL;
    else process.env.PUBLIC_URL = savedPublicUrl;
    if (savedSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = savedSecret;
  });

  it('fails fast when PUBLIC_URL is left at the localhost default in production', () => {
    delete process.env.PUBLIC_URL;
    expect(() => loadConfig({ nodeEnv: 'production', sessionSecret: 'x'.repeat(32) })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ nodeEnv: 'production', sessionSecret: 'x'.repeat(32) })).toThrow(
      /PUBLIC_URL/,
    );
  });

  it('accepts production when PUBLIC_URL is set to a real origin', () => {
    expect(() =>
      loadConfig({
        nodeEnv: 'production',
        sessionSecret: 'x'.repeat(32),
        publicUrl: 'https://knit.example.com',
      }),
    ).not.toThrow();
  });

  it('still requires SESSION_SECRET in production', () => {
    delete process.env.SESSION_SECRET;
    expect(() =>
      loadConfig({ nodeEnv: 'production', publicUrl: 'https://knit.example.com' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('uses the localhost default outside production without erroring', () => {
    delete process.env.PUBLIC_URL;
    const cfg = loadConfig({ nodeEnv: 'development' });
    expect(cfg.publicUrl).toBe('http://localhost:4000');
  });
});
