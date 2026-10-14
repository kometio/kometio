import { describe, expect, it } from 'vitest';
import {
  CannotEndCurrentSessionError,
  SessionNotFoundError,
} from '@kometio/domain-core';
import { FakeAuthPort } from '@kometio/testing';
import { endOtherSessions } from './end-other-sessions.use-case';
import { endSession } from './end-session.use-case';
import { listSessions } from './list-sessions.use-case';

const tenantId = 'tenant-1';
const userId = 'user-1';

async function signedInOnTwoDevices() {
  const authPort = new FakeAuthPort();
  const laptop = await authPort.createSession(userId, tenantId, {
    label: 'Chrome on macOS',
  });
  const phone = await authPort.createSession(userId, tenantId, {
    label: 'Safari on iPhone',
  });
  return { authPort, laptop, phone };
}

describe('listSessions', () => {
  it('shows where the person is signed in and which one they are looking from', async () => {
    const { authPort, laptop } = await signedInOnTwoDevices();

    const listed = await listSessions(
      { authPort },
      { tenantId, userId, currentSessionToken: laptop.token },
    );

    expect(listed.map((session) => session.deviceLabel).sort()).toEqual([
      'Chrome on macOS',
      'Safari on iPhone',
    ]);
    expect(listed.find((session) => session.isCurrent)?.deviceLabel).toBe(
      'Chrome on macOS',
    );
  });

  it('shows nothing of anybody else', async () => {
    const { authPort, laptop } = await signedInOnTwoDevices();
    await authPort.createSession('user-2', tenantId, {
      label: 'Firefox on Linux',
    });

    const listed = await listSessions(
      { authPort },
      { tenantId, userId, currentSessionToken: laptop.token },
    );

    expect(listed).toHaveLength(2);
  });
});

describe('endSession', () => {
  it('signs out the other device and leaves this one', async () => {
    const { authPort, laptop, phone } = await signedInOnTwoDevices();
    const listed = await listSessions(
      { authPort },
      { tenantId, userId, currentSessionToken: laptop.token },
    );
    const other = listed.find((session) => !session.isCurrent);

    await endSession(
      { authPort },
      {
        tenantId,
        userId,
        sessionId: other?.id ?? '',
        currentSessionToken: laptop.token,
      },
    );

    expect(await authPort.validateSession(phone.token)).toBeNull();
    expect(await authPort.validateSession(laptop.token)).not.toBeNull();
  });

  it('refuses to end the device the request came from: that is signing out', async () => {
    const { authPort, laptop } = await signedInOnTwoDevices();
    const listed = await listSessions(
      { authPort },
      { tenantId, userId, currentSessionToken: laptop.token },
    );
    const here = listed.find((session) => session.isCurrent);

    await expect(
      endSession(
        { authPort },
        {
          tenantId,
          userId,
          sessionId: here?.id ?? '',
          currentSessionToken: laptop.token,
        },
      ),
    ).rejects.toThrow(CannotEndCurrentSessionError);
    expect(await authPort.validateSession(laptop.token)).not.toBeNull();
  });

  it('is a not-found for an id that is not the person’s, and ends nothing', async () => {
    const { authPort, laptop } = await signedInOnTwoDevices();
    const stranger = await authPort.createSession('user-2', tenantId);
    const [theirs] = await authPort.listSessionsForUser(
      'user-2',
      tenantId,
      stranger.token,
    );

    await expect(
      endSession(
        { authPort },
        {
          tenantId,
          userId,
          sessionId: theirs.id,
          currentSessionToken: laptop.token,
        },
      ),
    ).rejects.toThrow(SessionNotFoundError);
    expect(await authPort.validateSession(stranger.token)).not.toBeNull();
  });
});

describe('endOtherSessions', () => {
  it('signs out every other device, and only theirs', async () => {
    const { authPort, laptop, phone } = await signedInOnTwoDevices();
    const stranger = await authPort.createSession('user-2', tenantId);

    await endOtherSessions(
      { authPort },
      { tenantId, userId, currentSessionToken: laptop.token },
    );

    expect(await authPort.validateSession(phone.token)).toBeNull();
    expect(await authPort.validateSession(laptop.token)).not.toBeNull();
    expect(await authPort.validateSession(stranger.token)).not.toBeNull();
  });
});
