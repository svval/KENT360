import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { hashPassword } from './domain/password-policy';

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './domain/password-policy';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  /** Never throws: a malformed stored hash simply fails verification. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real verification, so response timing does not reveal
   * whether an email address has an account.
   */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('kent360-timing-equaliser');
    await this.verify(await this.dummyHash, password);
  }
}
