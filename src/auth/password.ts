import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Salt and key sizes for scrypt. The salt is random per hash, so hashing the same
 * password twice produces two different stored strings.
 */
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Stored format: `scrypt$<saltHex>$<hashHex>`. The plaintext password is never stored,
 * returned or logged.
 */
const HASH_PREFIX = 'scrypt';
const HASH_SEPARATOR = '$';

function isHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES);

  return [HASH_PREFIX, salt.toString('hex'), hash.toString('hex')].join(HASH_SEPARATOR);
}

/**
 * Compares a candidate password against a stored `scrypt$<saltHex>$<hashHex>` value.
 * A malformed or unrecognised stored hash yields `false` rather than throwing.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split(HASH_SEPARATOR);
  if (parts.length !== 3) {
    return false;
  }

  const [prefix, saltHex, hashHex] = parts;
  if (prefix !== HASH_PREFIX) {
    return false;
  }

  if (!isHex(saltHex) || !isHex(hashHex) || hashHex.length !== KEY_BYTES * 2) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');

  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_BYTES);
  } catch {
    return false;
  }

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
