/** What a single-use token is for — the one list the domain and the `verification_token_purpose` enum read. */
export const VERIFICATION_TOKEN_PURPOSES = [
  'email-verification',
  'password-reset',
  'user-invite',
  'email-change',
  // The second step of a sign-in whose password was right: it says who is
  // being asked for a code, and goes in 5 minutes (docs/adr/0137).
  'second-factor',
] as const;
export type VerificationTokenPurpose =
  (typeof VERIFICATION_TOKEN_PURPOSES)[number];
