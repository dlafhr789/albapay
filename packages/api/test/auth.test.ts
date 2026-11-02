import { describe, expect, it } from 'vitest';
import { generateToken, hashToken, tokenMatches } from '../src/http/auth';

describe('tokens', () => {
  it('generates 43-character url-safe tokens that differ every time', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('stores only a SHA-256 hex digest', () => {
    expect(hashToken('example')).toBe('50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c');
  });

  it('matches a token against its stored hash', () => {
    const token = generateToken();
    const stored = hashToken(token);
    expect(tokenMatches(token, stored)).toBe(true);
    expect(tokenMatches(`${token}x`, stored)).toBe(false);
    expect(tokenMatches(token, 'not-a-hash')).toBe(false);
  });
});
