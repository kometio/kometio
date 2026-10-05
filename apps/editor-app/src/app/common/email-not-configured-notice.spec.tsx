import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as deployment from '../../lib/deployment-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { EmailNotConfiguredNotice } from './email-not-configured-notice';
import { deploymentRecord } from '../../test/deployment.test-fixture';

vi.mock('../../lib/deployment-api-client', () => ({ getDeployment: vi.fn() }));

function renderNotice() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <EmailNotConfiguredNotice />
    </QueryClientProvider>,
  );
}

/*
 * A deployment with no mail server writes its emails to the server's log
 * (docs/adr/0103). Nothing in the product would otherwise say so, and an
 * invitation that is "sent" and never arrives looks like a bug. The suite is
 * pinned to Italian, so the copy below is Italian.
 */
describe('EmailNotConfiguredNotice', () => {
  afterEach(() => vi.resetAllMocks());

  it('tells the administrator that email is not being sent, and where it goes', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue(
      deploymentRecord({ emailConfigured: false }),
    );

    renderNotice();

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toMatch(/non può inviare email/i);
    expect(notice.textContent).toMatch(/log del server/i);
    expect(notice.textContent).toContain('SMTP_HOST');
  });

  it('says nothing when the deployment can send email', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue(
      deploymentRecord({ emailConfigured: true }),
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
