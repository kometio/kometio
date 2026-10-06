import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  bootstrapDeployment,
  getSetupStatus,
  openSiteArchive,
} from '@kometio/application';
import { SessionCookies } from '../auth/session-cookies';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  bootstrapDeploymentBodySchema,
  type BootstrapDeploymentBody,
} from './setup.schemas';
import { SetupTokenRegistry } from './setup-token.registry';
import type { SetupDeps } from './setup.deps';
import { SETUP_DEPS } from './setup.tokens';

const SETUP_TOKEN_REFUSED =
  'Invalid setup token. It is printed in the API log — ' +
  '`docker logs kometio` for the one-image install, ' +
  '`docker compose logs api` for the compose stack — and changes ' +
  'each time the API restarts, so use the most recent one.';

/**
 * The first-run wizard's backend. Unauthenticated by necessity: it runs
 * when there is nobody to authenticate as. What gates it instead is that
 * the deployment is empty — checked here, and again inside the port's own
 * transaction, because two people opening the wizard at once is otherwise
 * a race with an admin account as the prize.
 *
 * Rate-limited, unlike it used to be. The old reasoning — "there is
 * exactly one request this endpoint will ever accept, and the emptiness
 * check rejects the rest" — stopped holding the moment a setup token was
 * added: there is now a secret to guess, and an unthrottled endpoint is
 * where you would guess it. 256 bits of entropy make that hopeless anyway;
 * the throttle is what keeps it hopeless if the token ever gets weaker.
 */
@Controller('setup')
export class SetupController {
  constructor(
    @Inject(SETUP_DEPS) private readonly deps: SetupDeps,
    private readonly setupToken: SetupTokenRegistry,
    private readonly cookies: SessionCookies,
  ) {}

  /**
   * What the editor loads before showing anything: the wizard when this is
   * false, the login page when it is true. Deliberately says nothing else
   * — no version, no hostname, no counts — but one sentence about a failed
   * import, below. It is reachable by anyone on the internet, and "is this
   * installation still unclaimed?" is already the most useful thing it could
   * tell an attacker.
   */
  @Get('status')
  async status(): Promise<{
    hasBeenSetUp: boolean;
    importFailure: string | null;
  }> {
    // Besides that, and only while there is no site, why the import the screen
    // was waiting for did not come through (docs/adr/0106): a sentence the launcher
    // chose to be read by anybody, never a path or what Postgres said.
    return getSetupStatus(this.deps);
  }

  /**
   * Signs the new admin in as part of the same request, rather than
   * bouncing them to the login form with the credentials they typed ten
   * seconds ago.
   *
   * It is not a convenience: logging in separately would have to pass
   * Turnstile, whose keys are configured through the very env file this
   * wizard exists so a self-hoster does not have to edit. A fresh
   * deployment would send an empty token to a real secret key and be
   * refused, leaving someone locked out of the installation they just
   * created. Issuing the session here needs no captcha to be meaningful:
   * whoever completed setup demonstrably controlled an unclaimed
   * installation, which is a stronger proof than the one login asks for.
   */
  // On the write alone, never on the controller. `GET /setup/status` is
  // polled by the editor on every route load, so a class-level guard puts
  // both in one bucket — a couple of page refreshes and the owner is
  // locked out of their own form by their own browser. Measured, not
  // guessed: that is exactly what happened the first time.
  @UseGuards(ThrottlerGuard)
  @Post()
  async bootstrap(
    @Body(new ZodValidationPipe(bootstrapDeploymentBodySchema))
    body: BootstrapDeploymentBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ tenantId: string; siteId: string; userId: string }> {
    // Before anything else, and before any password hashing: whoever is
    // asking has to prove they can read this server's logs. See
    // SetupTokenRegistry for why that is the bar.
    if (!this.setupToken.verify(body.setupToken)) {
      throw new UnauthorizedException(SETUP_TOKEN_REFUSED);
    }

    const { session, ...result } = await bootstrapDeployment(this.deps, body);

    // The process has been answering "not set up" and caching that. Without
    // this, the login the wizard performs next would fail against a tenant
    // that demonstrably exists — see DeploymentTenantResolver.refresh().
    this.deps.tenant.refresh();
    // Spent: nothing can use it again, and there is no reason to keep a
    // live credential in memory for the rest of the process's life.
    this.setupToken.clear();

    this.cookies.set(response, session);

    return result;
  }

  /**
   * Opens a site archive (a site from another installation) instead of making a
   * new one, from the same first-run screen and behind the same gate: the setup
   * token, here in a header, because the body is the archive itself. The gate is
   * checked before one byte of it is read, since an unauthenticated upload of
   * gigabytes is what it keeps out.
   *
   * The archive is handed to the launcher as it arrives and nothing is kept
   * here. The answer is 202, which is *accepted*, not done: opening it stops
   * this very process and starts it again, and the screen waits for that by
   * asking `GET /setup/status` (docs/adr/0106).
   */
  @UseGuards(ThrottlerGuard)
  @Post('import')
  @HttpCode(202)
  async importSite(
    @Headers('x-setup-token') candidate: string | undefined,
    // The request, which is the archive as it arrives: all that is asked of it is to be read.
    @Req() archive: AsyncIterable<Uint8Array>,
  ): Promise<{ accepted: true }> {
    if (!this.setupToken.verify(candidate ?? '')) {
      throw new UnauthorizedException(SETUP_TOKEN_REFUSED);
    }
    await openSiteArchive(this.deps, archive);
    return { accepted: true };
  }
}
