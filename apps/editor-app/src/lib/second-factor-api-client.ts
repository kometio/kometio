import {
  recoveryCodesSchema,
  secondFactorEnrolmentSchema,
  secondFactorStatusSchema,
  type ConfirmSecondFactorBody,
  type PasswordConfirmationBody,
  type RecoveryCodes,
  type SecondFactorEnrolment,
  type SecondFactorStatus,
} from '@kometio/api-contracts';
import { request, send } from './http-client';

/** Whether the second step of sign-in is offered here, is on for this person, and how many recovery codes they have left (docs/adr/0137). */
export async function getSecondFactorStatus(): Promise<SecondFactorStatus> {
  return secondFactorStatusSchema.parse(
    await request('/account/second-factor'),
  );
}

/** A secret to scan, once. It is not on until `confirmSecondFactor` is given a code that fits. */
export async function beginSecondFactor(
  password: string,
): Promise<SecondFactorEnrolment> {
  const body: PasswordConfirmationBody = { password };
  return secondFactorEnrolmentSchema.parse(
    await request('/account/second-factor/begin', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function confirmSecondFactor(
  code: string,
): Promise<RecoveryCodes> {
  const body: ConfirmSecondFactorBody = { code };
  return recoveryCodesSchema.parse(
    await request('/account/second-factor/confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function regenerateRecoveryCodes(
  password: string,
): Promise<RecoveryCodes> {
  const body: PasswordConfirmationBody = { password };
  return recoveryCodesSchema.parse(
    await request('/account/second-factor/recovery-codes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function disableSecondFactor(password: string): Promise<void> {
  const body: PasswordConfirmationBody = { password };
  return send('/account/second-factor/disable', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** An administrator takes it off another person: the one who lost the app and the codes. */
export function resetUserSecondFactor(userId: string): Promise<void> {
  return send(`/users/${userId}/second-factor/reset`, { method: 'POST' });
}
