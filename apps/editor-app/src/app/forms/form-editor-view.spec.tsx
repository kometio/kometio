import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { WithToasts } from '../../test/toasts.test-fixture';
import * as api from '../../lib/forms-api-client';
import type { FormRecord } from '../../lib/forms-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildFormRecord, buildSiteRecord } from '@kometio/testing/records';
import { ApiError } from '../../lib/http-client';
import { getCurrentSite } from '../../lib/sites-api-client';
import { formQueryOptions } from './forms-queries';
import { FormEditorView, type FormEditorViewProps } from './form-editor-view';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    // This view is rendered without a router here; the real one needs a
    // history to hold a navigation against. The blocker's own behaviour is
    // covered by the test below that drives it directly.
    useBlocker: () => ({ status: 'idle' as const }),
  };
});

vi.mock('../../lib/forms-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/forms-api-client')>();
  return { ...actual, updateForm: vi.fn(), listFormSubmissions: vi.fn() };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, getCurrentSite: vi.fn() };
});

const sampleForm = buildFormRecord({
  name: 'Candidatura',
  fields: [
    { id: 'nome', label: 'Nome', type: 'text', required: true },
    {
      id: 'esperienza',
      label: 'Esperienza',
      type: 'textarea',
      required: false,
    },
  ],
});

function renderView(
  form: FormRecord = sampleForm,
  props: Partial<Omit<FormEditorViewProps, 'formId'>> = {},
) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(formQueryOptions(form.id).queryKey, form);
  return render(
    <QueryClientProvider client={queryClient}>
      <WithToasts>
        <FormEditorView
          formId={form.id}
          tab="fields"
          onTabChange={vi.fn()}
          submissionsPage={1}
          onSubmissionsPageChange={vi.fn()}
          {...props}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

/*
 * This screen saves only when somebody presses Save, and until now it let
 * you leave a half-built form without a word: no dirty mark, no question.
 */
describe('FormEditorView — unsaved work', () => {
  it('marks the form dirty once something changes, and clean again after a save', async () => {
    vi.mocked(api.updateForm).mockResolvedValue(sampleForm);
    renderView();

    expect(screen.queryByText('Modifiche non salvate')).toBeNull();

    fireEvent.change(screen.getByLabelText('Nome modulo'), {
      target: { value: 'Contatti 2' },
    });
    expect(screen.getByText('Modifiche non salvate')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() =>
      expect(screen.queryByText('Modifiche non salvate')).toBeNull(),
    );
  });

  /*
   * The dirty mark compared the raw state against a baseline built from
   * the SAVED — trimmed, tidied — one, so anything the save normalised
   * left the editor permanently unsaved: the mark stayed on a form that
   * had just been written, and the guard then put "you will lose your
   * work" in front of every link. A warning that is always wrong is worse
   * than none, because people learn to click through it.
   */
  it('is clean after saving a select whose options end in a blank line', async () => {
    // The notification email cannot get stuck the same way, even though
    // the save trims it too: `type="email"` makes the browser strip the
    // spaces before React ever sees them. The options textarea has no such
    // help, which is why this is the case worth pinning.
    const withSelect: FormRecord = {
      ...sampleForm,
      fields: [
        {
          id: 'scelta',
          label: 'Scelta',
          type: 'select',
          required: false,
          options: ['A'],
        },
      ],
    };
    vi.mocked(api.updateForm).mockResolvedValue({
      ...withSelect,
      fields: [{ ...withSelect.fields[0], options: ['A', 'B'] }],
    });
    renderView(withSelect);

    // What a textarea leaves behind when somebody presses Enter after the
    // last option: an empty string the save drops.
    fireEvent.change(screen.getByLabelText('Opzioni (una per riga)'), {
      target: { value: 'A\nB\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await screen.findByText('Modulo salvato');
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });

  it('stops being dirty when a change is typed back to what was saved', () => {
    renderView();
    const name = screen.getByLabelText('Nome modulo');

    fireEvent.change(name, { target: { value: 'altro' } });
    expect(screen.getByText('Modifiche non salvate')).toBeTruthy();

    fireEvent.change(name, { target: { value: sampleForm.name } });
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });
});

describe('FormEditorView — saving', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Save was always pressable, so "did that do anything?" had no answer.
  it('has nothing to save until something has changed', () => {
    renderView();
    const save = screen.getByRole('button', { name: 'Salva' });
    expect(save.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Nome modulo'), {
      target: { value: 'Contatti 2' },
    });

    expect(save.hasAttribute('disabled')).toBe(false);
  });

  // "Form saved" used to stay in the page and sit next to "Unsaved changes"
  // as soon as the next edit was made. It is said once, as a toast.
  it('says it was saved once, as a toast, not as a line that stays', async () => {
    vi.mocked(api.updateForm).mockResolvedValue(sampleForm);
    renderView();
    fireEvent.change(screen.getByLabelText('Nome modulo'), {
      target: { value: 'Contatti 2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    const toast = await screen.findByText('Modulo salvato');
    expect(toast.closest('[role="status"]')).toBeTruthy();
  });

  it('says why a save was refused, in place', async () => {
    vi.mocked(api.updateForm).mockRejectedValue(
      new ApiError(400, { message: 'Un campo ha lo stesso nome di un altro' }),
    );
    renderView();
    fireEvent.change(screen.getByLabelText('Nome modulo'), {
      target: { value: 'Contatti 2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(
      await screen.findByText('Un campo ha lo stesso nome di un altro'),
    ).toBeTruthy();
  });

  // Pressing the words has to turn the switch, and the switch has to be
  // named by them.
  it('names the Required switch by a label that turns it on', () => {
    renderView();
    const [firstSwitch] = screen.getAllByRole('switch', {
      name: 'Obbligatorio',
    });
    if (!firstSwitch) throw new Error('no Required switch on the first field');
    expect(firstSwitch.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getAllByText('Obbligatorio')[0]);

    expect(firstSwitch.getAttribute('aria-checked')).toBe('false');
  });
});

describe('FormEditorView — the two sections', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is on the fields by default, and goes to the answers through the address', () => {
    const onTabChange = vi.fn();
    renderView(sampleForm, { onTabChange });

    expect(screen.getByLabelText('Nome modulo')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /risposte/i }));

    expect(onTabChange).toHaveBeenCalledWith('submissions');
  });

  // Nothing of the form's is written in the answers: a Save there would sit
  // next to a list it has nothing to do with.
  it('offers no Save in the answers', async () => {
    vi.mocked(api.listFormSubmissions).mockResolvedValue({
      items: [],
      total: 0,
      fields: sampleForm.fields,
      pages: [],
    });
    vi.mocked(getCurrentSite).mockResolvedValue(buildSiteRecord());
    renderView(sampleForm, { tab: 'submissions' });

    expect(await screen.findByText(/compariranno qui/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    expect(screen.queryByLabelText('Nome modulo')).toBeNull();
  });
});

describe('FormEditorView — multi-step', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows no step-assignment dropdown and a "no steps" hint for a plain single-step form', () => {
    renderView();

    expect(
      screen.getByText('Nessuno step: il modulo è a pagina singola.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Step')).toBeFalsy();
  });

  it('adding a step reveals a per-field step-assignment dropdown', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /aggiungi step/i }));

    expect(screen.getByPlaceholderText('Titolo dello step')).toBeTruthy();
    // Two fields in sampleForm, each now shows its own step dropdown.
    expect(screen.getAllByLabelText('Step')).toHaveLength(2);
  });

  it('assigning a field to a step, then removing that step, clears the assignment back to none', () => {
    renderView({
      ...sampleForm,
      steps: [{ id: 'step-1', title: 'Dati' }],
    });

    const [fieldStepSelect] = screen.getAllByLabelText('Step');
    fireEvent.change(fieldStepSelect, { target: { value: 'step-1' } });
    expect((fieldStepSelect as HTMLSelectElement).value).toBe('step-1');

    fireEvent.click(screen.getByRole('button', { name: /rimuovi step/i }));

    // No steps left at all now, so the dropdown disappears entirely —
    // the field's stepId was cleared, not left dangling on a deleted step.
    expect(screen.queryByLabelText('Step')).toBeFalsy();
  });

  it('saves the current steps alongside name and fields', async () => {
    vi.mocked(api.updateForm).mockResolvedValue({
      ...sampleForm,
      steps: [{ id: 'step-1', title: 'Dati personali' }],
    });
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /aggiungi step/i }));
    fireEvent.change(screen.getByPlaceholderText('Titolo dello step'), {
      target: { value: 'Dati personali' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await vi.waitFor(() =>
      expect(api.updateForm).toHaveBeenCalledWith(
        'form-1',
        expect.objectContaining({
          steps: [expect.objectContaining({ title: 'Dati personali' })],
        }),
      ),
    );
  });
});

describe('FormEditorView — what each role is offered (docs/roles.md)', () => {
  it('shows an editor the form read-only, and who saves it instead of Save', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderView();

    expect(
      screen.getByLabelText('Nome modulo').closest('fieldset')?.disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    expect(
      screen.getByText(
        'Un modulo va online appena salvato: lo salva un Publisher',
      ),
    ).toBeTruthy();
  });
});
