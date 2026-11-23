import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const PREFIX = 'enc:v1:';

/** Encrypts small secrets (API tokens, key files) before they are stored. AES-256-GCM, so tampering is detected. */
export class SecretBox {
  private readonly key: Buffer;

  constructor(passphrase: string) {
    this.key = scryptSync(passphrase, 'product-analytics-settings', 32);
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
  }

  /** Returns null when the value was not encrypted with this key (for example the secret changed). */
  decrypt(stored: string): string | null {
    if (!SecretBox.isEncrypted(stored)) return null;
    try {
      const [iv, tag, ct] = stored.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
