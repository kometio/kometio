import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import { SecondFactorForm } from './second-factor-form';
import { instanceOf } from '../../test/dom.test-fixture';

// The suite runs pinned to Italian (test-setup.ts).
function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onStartAgain = vi.fn();
  render(
    <SecondFactorForm
      challenge="challenge-1"
      onSubmit={onSubmit}
      onStartAgain={onStartAgain}
    />,
  );
  return { onSubmit, onStartAgain };
}

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText('Codice'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /^accedi$/i }));
}

describe('SecondFactorForm', () => {
  it('sends the code with the challenge the password led to', async () => {
    const { onSubmit } = renderForm();

    typeCode('123456');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('challenge-1', '123456'),
    );
  });

  it('asks for a one-time code, so a phone offers the one it just received', () => {
    renderForm();

    expect(screen.getByLabelText('Codice').getAttribute('autocomplete')).toBe(
      'one-time-code',
    );
  });

  it('says a wrong code is wrong, empties the field and tries again with the new challenge', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(401, {
          message: 'The code is not right',
          challenge: 'c2',
        }),
      )
      .mockResolvedValue(undefined);
    renderForm(onSubmit);

    typeCode('000000');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringMatching(/non è giusto/i),
    );
    expect(
      instanceOf(screen.getByLabelText('Codice'), HTMLInputElement).value,
    ).toBe('');
    typeCode('654321');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith('c2', '654321'),
    );
  });

  it('says the codes are held back when the server says so', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(401, {
        message: 'The code is not right',
        challenge: 'c2',
        locked: true,
      }),
    );
    renderForm(onSubmit);

    typeCode('123456');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringMatching(/troppi codici sbagliati/i),
    );
  });

  it('says so when the address has asked too often, and keeps the challenge it has', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(429, { message: 'Too Many Requests' }),
      )
      .mockResolvedValue(undefined);
    const { onStartAgain } = renderForm(onSubmit);

    typeCode('123456');

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringMatching(/troppi tentativi/i),
    );
    expect(onStartAgain).not.toHaveBeenCalled();
    typeCode('123456');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith('challenge-1', '123456'),
    );
  });

  it('goes back to the password when there is no new challenge to give', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(401, { message: 'The code is not right' }),
      );
    const { onStartAgain } = renderForm(onSubmit);

    typeCode('000000');

    await waitFor(() => expect(onStartAgain).toHaveBeenCalled());
  });

  it('goes back to the password on a request that did not get to the server, too', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('network down'));
    const { onStartAgain } = renderForm(onSubmit);

    typeCode('123456');

    await waitFor(() => expect(onStartAgain).toHaveBeenCalled());
  });

  it('lets the person start again from the password', () => {
    const { onStartAgain } = renderForm();

    fireEvent.click(
      screen.getByRole('button', { name: /ricomincia dalla password/i }),
    );

    expect(onStartAgain).toHaveBeenCalled();
  });
});
