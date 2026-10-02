import { timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { generateOpaqueToken } from '@kometio/opaque-token';
import type { DeploymentBootstrapPort } from '@kometio/ports';
import { DEPLOYMENT_BOOTSTRAP_PORT } from '../adapters/port.tokens';

/**
 * The gate on the first-run wizard.
 *
 * Without it, `POST /setup` is protected by nothing but "no tenant exists
 * yet", so between `docker compose up` and the owner filling in the form,
 * whoever reaches `admin.<domain>` first becomes the administrator — and
 * `GET /setup/status` announces to the internet that an installation is
 * still unclaimed. The real owner then finds "already set up" and has no
 * way in. This is not a hypothetical: it is WordPress's `install.php`
 * race, and there are scanners that look for exactly it.
 *
 * The token is printed to this process's log at boot, so the only person
 * who can complete setup is the one who can read the server's logs — the
 * operator. GitLab (its initial root password file) and Jupyter (its
 * `?token=` URL) close the same hole the same way.
 *
 * **Held in memory and regenerated on every boot**, deliberately, rather
 * than persisted. The two obvious alternatives are both worse: storing it
 * in plaintext would put a live credential at rest, against the convention
 * every other token in this codebase follows (sessions and verification
 * tokens are SHA-256 hashes, see `@kometio/opaque-token`); storing only a
 * hash would mean it could never be printed again after the boot that
 * created it, so an operator who missed that line would be stuck. A fresh
 * token per boot is always printable, never at rest, and invalidates its
 * predecessor.
 *
 * The cost is that restarting the API invalidates a token someone may
 * already have copied. That is why the log line says so, and why the
 * rejection message tells them to look again.
 */
@Injectable()
export class SetupTokenRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger('Setup');
  private token: string | null = null;

  constructor(
    @Inject(DEPLOYMENT_BOOTSTRAP_PORT)
    private readonly deploymentBootstrapPort: DeploymentBootstrapPort,
  ) {}

  /**
   * Issues and announces a token, but only on a deployment nobody has
   * claimed yet — an installation in normal service neither needs one nor
   * should be printing one.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (await this.deploymentBootstrapPort.hasBeenSetUp()) return;

    this.token = generateOpaqueToken();
    this.logger.warn(
      '\n' +
        '  ┌─────────────────────────────────────────────────────────────┐\n' +
        '  │  This Kometio deployment has not been set up yet.             │\n' +
        '  │  Open the editor and enter this setup token:                │\n' +
        '  └─────────────────────────────────────────────────────────────┘\n' +
        `\n      ${this.token}\n\n` +
        "  Anyone who has it can create this installation's administrator,\n" +
        '  so treat it as a password. It is regenerated every time the API\n' +
        '  restarts, and only the most recent one above works.\n',
    );
  }

  /**
   * Constant-time, and false once setup has run. The comparison guards
   * against a timing oracle; the length check exists because
   * `timingSafeEqual` throws on mismatched lengths rather than returning
   * false, which would turn a wrong-length guess into a 500 and leak the
   * length through the status code.
   */
  verify(candidate: string): boolean {
    if (!this.token) return false;
    const expected = Buffer.from(this.token, 'utf8');
    const given = Buffer.from(candidate, 'utf8');
    if (expected.length !== given.length) return false;
    return timingSafeEqual(expected, given);
  }

  /**
   * Called once the wizard has succeeded. Belt and braces: `hasBeenSetUp()`
   * already refuses a second run, so the token is inert from that moment —
   * this just stops a live credential sitting in memory for the process's
   * remaining lifetime.
   */
  clear(): void {
    this.token = null;
  }
}
