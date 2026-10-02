export interface ExpiredTokensRemoved {
  deletedSessions: number;
  deletedVerificationTokens: number;
}

/**
 * What the scheduled clean-ups remove: records whose time has passed, for
 * one tenant. Each still has a rule that stops it acting on the read path
 * — an expired session is refused when presented — so this is housekeeping
 * for the ones never presented again, not the thing that keeps them out.
 */
export interface ExpiredRecordsPort {
  /** Sessions and one-time tokens (invites, resets, verifications) past their expiry. */
  deleteExpiredTokens(tenantId: string): Promise<ExpiredTokensRemoved>;
  /** Form answers older than the retention their site chose; a site with no retention keeps everything. */
  deleteExpiredFormSubmissions(
    tenantId: string,
  ): Promise<{ deletedSubmissions: number }>;
}
