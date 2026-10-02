/** What a single-use emailed token is for — the one list the domain and the `verification_token_purpose` enum read. */
export const VERIFICATION_TOKEN_PURPOSES = [
  'email-verification',
  'password-reset',
  'user-invite',
  'email-change',
] as const;
export type VerificationTokenPurpose =
  (typeof VERIFICATION_TOKEN_PURPOSES)[number];
