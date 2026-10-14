import type {
  SecondFactorRepositoryPort,
  TotpFactor,
  TotpPort,
} from '@kometio/ports';

const STEP_SECONDS = 30;

function normalise(code: string): string {
  return code.toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * A second factor whose codes a spec can work out: `codeAt(secret, at)` is
 * what the app would show. The arithmetic is not TOTP and does not claim to
 * be: what the real one does is `@kometio/totp-authenticator`'s spec, against
 * the RFC's vectors. A use case only has to ask, and to honour `notBeforeStep`.
 */
export class FakeTotp implements TotpPort {
  private secrets = 0;
  private recoveryCodes = 0;

  generateSecret(): string {
    this.secrets += 1;
    return `SECRET${this.secrets}`;
  }

  provisioningUri(input: {
    secret: string;
    accountName: string;
    issuer: string;
  }): string {
    return `otpauth://totp/${input.issuer}:${input.accountName}?secret=${input.secret}`;
  }

  /** What the app shows for `secret` during the step `at` falls in. */
  codeAt(secret: string, at: Date): string {
    return this.codeForStep(
      secret,
      Math.floor(at.getTime() / 1000 / STEP_SECONDS),
    );
  }

  private codeForStep(secret: string, step: number): string {
    const seed = [...secret].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return String((seed * 7919 + step) % 1_000_000).padStart(6, '0');
  }

  verify(input: {
    secret: string;
    code: string;
    at: Date;
    notBeforeStep?: number;
  }): { step: number } | null {
    const code = input.code.replace(/\s+/g, '');
    const current = Math.floor(input.at.getTime() / 1000 / STEP_SECONDS);
    for (const step of [current, current - 1, current + 1]) {
      if (
        code === this.codeForStep(input.secret, step) &&
        step >= (input.notBeforeStep ?? 0)
      ) {
        return { step };
      }
    }
    return null;
  }

  generateRecoveryCode(): string {
    this.recoveryCodes += 1;
    const n = String(this.recoveryCodes).padStart(5, '0');
    return `rec${n}-xxxxx`;
  }

  hashRecoveryCode(code: string): string {
    return `hash:${normalise(code)}`;
  }

  looksLikeRecoveryCode(input: string): boolean {
    return !/^\d{6}$/.test(input.replace(/\s+/g, ''));
  }
}

export class InMemorySecondFactorRepository implements SecondFactorRepositoryPort {
  private readonly factors = new Map<string, TotpFactor>();
  private readonly codes = new Map<
    string,
    { hash: string; spent: boolean }[]
  >();

  private readonly failures = new Map<string, number>();
  private readonly lockedUntil = new Map<string, Date>();

  private key(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  findTotp(tenantId: string, userId: string): Promise<TotpFactor | null> {
    const factor = this.factors.get(this.key(tenantId, userId));
    return Promise.resolve(factor ? { ...factor } : null);
  }

  whichHaveSecondFactor(
    tenantId: string,
    userIds: string[],
  ): Promise<Set<string>> {
    return Promise.resolve(
      new Set(
        userIds.filter(
          (id) => this.factors.get(this.key(tenantId, id))?.confirmedAt,
        ),
      ),
    );
  }

  savePendingTotp(
    tenantId: string,
    userId: string,
    sealedSecret: string,
  ): Promise<void> {
    this.factors.set(this.key(tenantId, userId), {
      tenantId,
      userId,
      sealedSecret,
      confirmedAt: null,
      lastUsedStep: null,
    });
    this.failures.delete(this.key(tenantId, userId));
    this.codes.delete(this.key(tenantId, userId));
    return Promise.resolve();
  }

  confirmTotp(
    tenantId: string,
    userId: string,
    firstStep: number,
    recoveryCodeHashes: string[],
  ): Promise<boolean> {
    const key = this.key(tenantId, userId);
    const factor = this.factors.get(key);
    if (!factor || factor.confirmedAt) return Promise.resolve(false);
    this.factors.set(key, {
      ...factor,
      confirmedAt: new Date(),
      lastUsedStep: firstStep,
    });
    this.codes.set(
      key,
      recoveryCodeHashes.map((hash) => ({ hash, spent: false })),
    );
    return Promise.resolve(true);
  }

  useStep(tenantId: string, userId: string, step: number): Promise<boolean> {
    const key = this.key(tenantId, userId);
    const factor = this.factors.get(key);
    if (!factor?.confirmedAt) return Promise.resolve(false);
    if (factor.lastUsedStep !== null && factor.lastUsedStep >= step) {
      return Promise.resolve(false);
    }
    this.factors.set(key, { ...factor, lastUsedStep: step });
    this.failures.delete(key);
    this.lockedUntil.delete(key);
    return Promise.resolve(true);
  }

  reserveAttempt(
    tenantId: string,
    userId: string,
    now: Date,
    policy: { maxAttempts: number; lockMs: number },
  ): Promise<boolean> {
    const key = this.key(tenantId, userId);
    if (!this.factors.get(key)?.confirmedAt) return Promise.resolve(false);
    const until = this.lockedUntil.get(key);
    if (until && until > now) return Promise.resolve(false);
    const count = (until ? 0 : (this.failures.get(key) ?? 0)) + 1;
    this.lockedUntil.delete(key);
    this.failures.set(key, count);
    if (count >= policy.maxAttempts) {
      this.lockedUntil.set(key, new Date(now.getTime() + policy.lockMs));
    }
    return Promise.resolve(true);
  }

  clearFailedAttempts(tenantId: string, userId: string): Promise<void> {
    const key = this.key(tenantId, userId);
    this.failures.delete(key);
    this.lockedUntil.delete(key);
    return Promise.resolve();
  }

  spendRecoveryCode(
    tenantId: string,
    userId: string,
    codeHash: string,
  ): Promise<boolean> {
    const code = this.codes
      .get(this.key(tenantId, userId))
      ?.find((c) => c.hash === codeHash && !c.spent);
    if (!code) return Promise.resolve(false);
    code.spent = true;
    return Promise.resolve(true);
  }

  countUnspentRecoveryCodes(tenantId: string, userId: string): Promise<number> {
    return Promise.resolve(
      (this.codes.get(this.key(tenantId, userId)) ?? []).filter((c) => !c.spent)
        .length,
    );
  }

  replaceRecoveryCodes(
    tenantId: string,
    userId: string,
    codeHashes: string[],
  ): Promise<void> {
    this.codes.set(
      this.key(tenantId, userId),
      codeHashes.map((hash) => ({ hash, spent: false })),
    );
    return Promise.resolve();
  }

  removeAll(tenantId: string, userId: string): Promise<boolean> {
    const key = this.key(tenantId, userId);
    const had = this.factors.has(key) || this.codes.has(key);
    this.factors.delete(key);
    this.codes.delete(key);
    return Promise.resolve(had);
  }
}
