import { afterEach } from 'vitest';
import {
  assertNoNetworkAttempts,
  blockNetwork,
} from './lib/no-network.test-fixture';

// A vitest project lists this in `setupFiles`: its tests talk to this machine
// and to nothing else, and one that tries fails with the address it asked for.
blockNetwork();
afterEach(assertNoNetworkAttempts);
