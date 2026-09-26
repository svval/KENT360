import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id (OWASP parameters) and verifies', async () => {
    const hash = await service.hash('Kent360!Demo');

    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(hash.split('$')[3].split(',').sort()).toEqual(['m=19456', 'p=1', 't=2']);
    expect(hash).not.toContain('Kent360!Demo');
    await expect(service.verify(hash, 'Kent360!Demo')).resolves.toBe(true);
    await expect(service.verify(hash, 'kent360!demo')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await service.hash('same-password')).not.toBe(await service.hash('same-password'));
  });

  it('treats a malformed stored hash as a failed verification', async () => {
    await expect(service.verify('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('runs the timing equaliser without throwing', async () => {
    await expect(service.verifyAgainstDummy('anything')).resolves.toBeUndefined();
  });
});
