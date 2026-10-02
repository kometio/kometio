/**
 * The two headers the public site sends with every call it makes to the
 * public API on a visitor's behalf.
 *
 * Named here, in the package both sides already depend on, because a
 * header spelled one way by the sender and another by the receiver fails
 * silently: the API would simply fall back to rate-limiting the sending
 * server, which is the bug this pair exists to fix, and nothing would say
 * so. See PublicPagesThrottlerGuard and public-api-client's callerHeaders.
 */

/** Proves the caller is this deployment's own public site, not the internet. */
export const PUBLIC_API_SERVICE_TOKEN_HEADER = 'x-kometio-service-token';

/**
 * The address of the person actually browsing. Believed only when the
 * token above checks out — the API answers on a public hostname, so an
 * unauthenticated caller claiming an address is a caller choosing its own
 * rate-limit bucket.
 */
export const PUBLIC_API_VISITOR_IP_HEADER = 'x-kometio-visitor-ip';
