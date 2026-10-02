import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PreviewContentType } from '@kometio/domain-core';
import type { PreviewToken, PreviewTokenPort } from '@kometio/ports';

interface PreviewTokenPayload {
  tenantId: string;
  contentType: PreviewContentType;
  contentId: string;
  expiresAt: number;
}

/**
 * A signed payload is still checked for its shape: the signature proves
 * the server wrote it, not that the code that wrote it matches this one.
 * A payload without a numeric `expiresAt` compared `undefined <= now` as
 * false, and so never expired.
 */
function isPreviewTokenPayload(value: unknown): value is PreviewTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'tenantId' in value &&
    typeof value.tenantId === 'string' &&
    'contentType' in value &&
    typeof value.contentType === 'string' &&
    'contentId' in value &&
    typeof value.contentId === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt)
  );
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * Stateless and non-consuming by construction: there is no row to persist
 * or clean up (it used to be `content_preview_tokens`, the fastest-growing
 * of the three tables the 2026-08-24 review found, with no cleanup
 * mechanism at all). The token itself carries (tenantId, contentType,
 * contentId, expiresAt) plus an HMAC signature — validating means only
 * recomputing the signature and checking the expiry, never a query.
 *
 * Unlike sessions and verification_tokens, neither early revocation (a
 * preview link lives an hour, only within the editor's own browser session)
 * nor single use (the canvas reloads the iframe several times with the same
 * token) is needed here — the two properties that do justify those other
 * two Ports' DB-backed mechanism.
 *
 * A security note: the payload is signed but not encrypted — tenantId,
 * contentType and contentId stay readable to anyone holding the token (by
 * decoding the base64url), though not forgeable without the secret.
 * Acceptable here: tenantId is not treated as a secret anywhere else in
 * this codebase (single-tenant-per-deployment, docs/adr/0010), and whoever
 * holds the token is already, by construction, the iframe authorized to see
 * exactly that contentId.
 */
export class PreviewTokenAdapter implements PreviewTokenPort {
  constructor(private readonly secret: string) {}

  async createToken(
    tenantId: string,
    contentType: PreviewContentType,
    contentId: string,
    ttlMs: number,
  ): Promise<PreviewToken> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const payload: PreviewTokenPayload = {
      tenantId,
      contentType,
      contentId,
      expiresAt: expiresAt.getTime(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const token = `${payloadB64}.${sign(payloadB64, this.secret)}`;

    return { token, tenantId, contentType, contentId, expiresAt };
  }

  async validateToken(
    token: string,
    contentType: PreviewContentType,
    contentId: string,
  ): Promise<PreviewToken | null> {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) {
      return null;
    }

    const expectedSignature = sign(payloadB64, this.secret);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    } catch {
      return null;
    }
    if (!isPreviewTokenPayload(parsed)) {
      return null;
    }
    const payload = parsed;

    if (
      payload.contentType !== contentType ||
      payload.contentId !== contentId ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      token,
      tenantId: payload.tenantId,
      contentType: payload.contentType,
      contentId: payload.contentId,
      expiresAt: new Date(payload.expiresAt),
    };
  }
}
