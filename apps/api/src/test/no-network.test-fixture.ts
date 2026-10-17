import {
  assertNoNetworkAttempts,
  blockNetwork,
} from '@kometio/testing/no-network';

// A suite talks to this machine and to nothing else: a Postgres on localhost,
// the application it starts itself. What would go further (an HTTP call to a
// service, an SDK's own client) is a fake in libs/testing, or the test fails
// with the address it tried to reach. See libs/testing no-network.
blockNetwork();
afterEach(assertNoNetworkAttempts);
