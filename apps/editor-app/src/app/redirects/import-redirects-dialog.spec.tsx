import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import type { RedirectImportReport } from '../../lib/redirects-api-client';
import { ImportRedirectsDialog } from './import-redirects-dialog';
import { instanceOf } from '../../test/dom.test-fixture';

function report(overrides: Partial<RedirectImportReport> = {}) {
  return {
    rows: [],
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    truncated: false,
    applied: false,
    ...overrides,
  } satisfies RedirectImportReport;
}

function renderDialog(
  options: {
    onCheck?: () => Promise<RedirectImportReport>;
    onApply?: () => Promise<RedirectImportReport>;
  } = {},
) {
  const onCheck = vi.fn(options.onCheck ?? (async () => report()));
  const onApply = vi.fn(options.onApply ?? (async () => report()));
  const onApplied = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ImportRedirectsDialog
      siteId="site-1"
      withWordPress={false}
      onOpenChange={onOpenChange}
      onCheck={onCheck}
      onApply={onApply}
      onApplied={onApplied}
    />,
  );
  return { onCheck, onApply, onApplied, onOpenChange };
}

const paste = (value: string) =>
  fireEvent.change(screen.getByLabelText('Oppure incolla qui l’elenco'), {
    target: { value },
  });
const check = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Controlla l’elenco' }));
  });

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  return input;
}

describe('ImportRedirectsDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cannot check an empty list', () => {
    renderDialog();

    expect(
      instanceOf(
        screen.getByRole('button', {
          name: 'Controlla l’elenco',
        }),
        HTMLButtonElement,
      ).disabled,
    ).toBe(true);
  });

  it('reads a file into the field, where it can still be changed', async () => {
    renderDialog();

    const file = new File(['from,to\n/a,/b\n'], 'redirects.csv', {
      type: 'text/csv',
    });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });

    await waitFor(() =>
      expect(
        instanceOf(
          screen.getByLabelText('Oppure incolla qui l’elenco'),
          HTMLTextAreaElement,
        ).value,
      ).toBe('from,to\n/a,/b\n'),
    );
  });

  it('refuses a file larger than the API takes, before reading it', async () => {
    renderDialog();
    const big = new File(['x'], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 2_000_001 });

    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [big] } });
    });

    expect(
      await screen.findByText('Il file supera i 2 MB. Dividilo in più parti.'),
    ).toBeTruthy();
  });

  it('says what the list would do, and goes back to change it', async () => {
    renderDialog({
      onCheck: async () =>
        report({ created: 2, updated: 1, unchanged: 3, failed: 0 }),
    });
    paste('/a,/b');

    await check();

    expect(
      await screen.findByText('2 nuovi · 1 modificato · 3 già a posto'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(
      instanceOf(
        screen.getByLabelText('Oppure incolla qui l’elenco'),
        HTMLTextAreaElement,
      ).value,
    ).toBe('/a,/b');
  });

  it('does not offer to import a list that has nothing in it that works', async () => {
    renderDialog({ onCheck: async () => report({ unchanged: 2 }) });
    paste('/a,/b');

    await check();

    const button = await screen.findByRole('button', {
      name: 'Niente da importare',
    });
    expect(instanceOf(button, HTMLButtonElement).disabled).toBe(true);
  });

  it('says a file that was cut short, and each line that cannot be used', async () => {
    renderDialog({
      onCheck: async () =>
        report({
          created: 1,
          failed: 2,
          truncated: true,
          rows: [
            {
              line: 4,
              from: '',
              to: '',
              outcome: 'error',
              side: 'file',
              problem: 'missing-to',
            },
            {
              line: 9,
              from: '/x',
              to: 'ftp://files.test/a',
              outcome: 'error',
              side: 'target',
              problem: 'unsafe',
            },
          ],
        }),
    });
    paste('/a,/b');

    await check();

    expect(await screen.findByText(/solo le prime 5000 righe/)).toBeTruthy();
    expect(screen.getByText('Riga 4')).toBeTruthy();
    expect(screen.getByText('Manca l’indirizzo nuovo.')).toBeTruthy();
    expect(screen.getByText('Riga 9')).toBeTruthy();
    expect(screen.getByText('Questo indirizzo non si può usare.')).toBeTruthy();
  });

  it('applies the list it checked, tells what was done, and closes', async () => {
    const { onApply, onApplied, onOpenChange } = renderDialog({
      onCheck: async () => report({ created: 1 }),
      onApply: async () => report({ created: 1, applied: true }),
    });
    paste('/a,/b');
    await check();

    await act(async () => {
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Importa 1 reindirizzamento',
        }),
      );
    });

    await waitFor(() => expect(onApply).toHaveBeenCalledWith('/a,/b'));
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ applied: true }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says what the server said when the list is refused, and keeps it', async () => {
    renderDialog({
      onCheck: async () => {
        throw new ApiError(400, { message: 'The list is not valid' });
      },
    });
    paste('/a,/b');

    await check();

    expect(await screen.findByText('The list is not valid')).toBeTruthy();
    expect(
      instanceOf(
        screen.getByLabelText('Oppure incolla qui l’elenco'),
        HTMLTextAreaElement,
      ).value,
    ).toBe('/a,/b');
  });
});
