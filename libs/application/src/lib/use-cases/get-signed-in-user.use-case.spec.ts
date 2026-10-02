import { buildUser, InMemoryUserRepository } from '@kometio/testing';
import { describe, expect, it } from 'vitest';
import { getSignedInUser } from './get-signed-in-user.use-case';

describe('getSignedInUser', () => {
  it('says who the session belongs to, and nothing else about them', async () => {
    const userRepository = new InMemoryUserRepository();
    await userRepository.add(
      buildUser({ id: 'user-1', email: 'anna@esempio.test', role: 'editor' }),
    );

    expect(
      await getSignedInUser(
        { userRepository },
        { tenantId: 'tenant-1', userId: 'user-1' },
      ),
    ).toEqual({ userId: 'user-1', email: 'anna@esempio.test', role: 'editor' });
  });

  it('is nobody once the account is gone', async () => {
    expect(
      await getSignedInUser(
        { userRepository: new InMemoryUserRepository() },
        { tenantId: 'tenant-1', userId: 'user-1' },
      ),
    ).toBeNull();
  });
});
