import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { requestPasswordReset } from '../../lib/auth-api-client';

export function useForgotPasswordRequest() {
  const mutation = useMutation({
    mutationFn: ({
      email,
      captchaToken,
    }: {
      email: string;
      captchaToken: string;
    }) => requestPasswordReset(email, captchaToken),
  });

  // Always resolves as "sent", whether the request succeeded, the email
  // didn't match an account, or the call itself failed — same
  // anti-enumeration principle the backend already enforces (see
  // requestPasswordReset use-case), so the caller never has to branch on it.
  // This also swallows a genuine CAPTCHA failure (widget blocked/expired) —
  // rare for a real visitor, and the disabled-submit-until-token-present
  // gate in ForgotPasswordForm is the primary guardrail against that.
  const requestReset = useCallback(
    async (email: string, captchaToken: string) => {
      try {
        await mutation.mutateAsync({ email, captchaToken });
      } catch {
        // ignored on purpose, see comment above
      }
    },
    [mutation],
  );

  return { requestReset, isSubmitting: mutation.isPending };
}
