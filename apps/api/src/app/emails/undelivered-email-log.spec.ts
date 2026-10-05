import { Logger } from '@nestjs/common';
import { UndeliveredEmailLog } from './undelivered-email-log';

describe('UndeliveredEmailLog', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('writes one entry for each email that did not go out, naming what was being done, the address and the reason', () => {
    const reason = new Error('connect ECONNREFUSED');

    new UndeliveredEmailLog().report('Invitation', [
      { to: 'a@example.com', reason },
      { to: 'b@example.com', reason: 'refused' },
    ]);

    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenNthCalledWith(
      1,
      'Invitation: the email to a@example.com was not sent',
      reason.stack,
    );
    expect(error).toHaveBeenNthCalledWith(
      2,
      'Invitation: the email to b@example.com was not sent',
      'refused',
    );
  });

  it('writes nothing when everything went out', () => {
    new UndeliveredEmailLog().report('Invitation', []);

    expect(error).not.toHaveBeenCalled();
  });
});
