import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as deployment from '../../lib/deployment-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { deploymentRecord } from '../../test/deployment.test-fixture';
import { DemoNotice } from './demo-notice';

vi.mock('../../lib/deployment-api-client', () => ({ getDeployment: vi.fn() }));

function renderNotice() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DemoNotice />
    </QueryClientProvider>,
  );
}

/*
 * A demo (docs/adr/0118) is shared, starts over, and takes no upload: without
 * a sentence on the screen the first upload is refused with no way to know
 * why. The suite is pinned to Italian, so the copy below is Italian.
 */
describe('DemoNotice', () => {
  afterEach(() => vi.resetAllMocks());

  it('tells whoever is in a demo what it is', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue(
      deploymentRecord({ demo: true }),
    );

    renderNotice();

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/questa è una demo/i);
    expect(notice.textContent).toMatch(/non viene conservato/i);
  });

  it('says nothing on a deployment that is not a demo', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue(
      deploymentRecord({ demo: false }),
    );

    renderNotice();

    await waitFor(() =>
      expect(deployment.getDeployment).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says nothing when it cannot find out: a notice is only worth showing when it is true', async () => {
    vi.mocked(deployment.getDeployment).mockRejectedValue(new Error('down'));

    renderNotice();

    await waitFor(() =>
      expect(deployment.getDeployment).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
