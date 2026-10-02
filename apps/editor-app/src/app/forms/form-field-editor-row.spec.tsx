import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormField, FormStep } from '@kometio/shared-types';
import { TooltipProvider } from '../../components/ui/tooltip';
import { chooseOption, optionNames } from '../../test/select.test-fixture';
import { FormFieldEditorRow } from './form-field-editor-row';

function renderRow(
  field: FormField,
  onChange: (field: FormField) => void = vi.fn(),
  steps: FormStep[] = [],
  earlierFields: FormField[] = [],
) {
  return render(
    <TooltipProvider>
      <FormFieldEditorRow
        field={field}
        onChange={onChange}
        onRemove={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        canMoveUp={false}
        canMoveDown={false}
        steps={steps}
        earlierFields={earlierFields}
      />
    </TooltipProvider>,
  );
}

describe('FormFieldEditorRow', () => {
  it('updates the label', () => {
    const onChange = vi.fn();
    renderRow({ id: 'f1', label: '', type: 'text', required: false }, onChange);

    fireEvent.change(screen.getByLabelText('Etichetta'), {
      target: { value: 'Nome' },
    });

    expect(onChange).toHaveBeenCalledWith({
      id: 'f1',
      label: 'Nome',
      type: 'text',
      required: false,
    });
  });

  it('shows the options textarea only for the select type', () => {
    const { unmount } = renderRow({
      id: 'f1',
      label: 'x',
      type: 'text',
      required: false,
    });
    expect(screen.queryByLabelText(/opzioni/i)).toBeFalsy();
    unmount();

    renderRow({
      id: 'f2',
      label: 'x',
      type: 'select',
      required: false,
      options: [],
    });
    expect(screen.getByLabelText(/opzioni/i)).toBeTruthy();
  });

  it('keeps a newly typed blank line in the options textarea instead of collapsing it', () => {
    // Regression: an earlier version filtered out empty lines on every
    // keystroke, so pressing Enter after the first option immediately
    // erased the blank line it had just created — the user could never
    // get a cursor onto a second line to start typing the next option.
    // Sanitizing (trim + drop blanks) now happens once, at save time
    // (form-editor-view.tsx), not on every change here.
    const onChange = vi.fn();
    renderRow(
      {
        id: 'f1',
        label: 'x',
        type: 'select',
        required: false,
        options: ['Preventivo'],
      },
      onChange,
    );

    fireEvent.change(screen.getByLabelText(/opzioni/i), {
      target: { value: 'Preventivo\n' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Preventivo', ''] }),
    );
  });

  it('lists newsletter-consent as a selectable type, with no options textarea', () => {
    renderRow({
      id: 'f1',
      label: 'x',
      type: 'newsletter-consent',
      required: false,
    });

    expect(optionNames(screen.getByLabelText('Tipo'))).toContain(
      'Iscrizione newsletter',
    );
    expect(screen.queryByLabelText(/opzioni/i)).toBeFalsy();
  });

  it('lists date, time and file as selectable types, with no options textarea', () => {
    const { unmount: unmountDate } = renderRow({
      id: 'f1',
      label: 'x',
      type: 'date',
      required: false,
    });
    expect(optionNames(screen.getByLabelText('Tipo'))).toContain('Data');
    expect(screen.queryByLabelText(/opzioni/i)).toBeFalsy();
    unmountDate();

    const { unmount: unmountTime } = renderRow({
      id: 'f2',
      label: 'x',
      type: 'time',
      required: false,
    });
    expect(optionNames(screen.getByLabelText('Tipo'))).toContain('Ora');
    unmountTime();

    renderRow({ id: 'f3', label: 'x', type: 'file', required: false });
    expect(optionNames(screen.getByLabelText('Tipo'))).toContain(
      'Caricamento file',
    );
    expect(screen.queryByLabelText(/opzioni/i)).toBeFalsy();
  });

  it('shows no step dropdown when the form has no steps', () => {
    renderRow(
      { id: 'f1', label: 'x', type: 'text', required: false },
      vi.fn(),
      [],
    );

    expect(screen.queryByLabelText('Step')).toBeFalsy();
  });

  it('shows a step dropdown listing every step, plus "no step", when the form has steps', () => {
    const steps: FormStep[] = [
      { id: 'step-1', title: 'Dati personali' },
      { id: 'step-2', title: 'Dettagli' },
    ];
    renderRow(
      { id: 'f1', label: 'x', type: 'text', required: false },
      vi.fn(),
      steps,
    );

    const select = screen.getByLabelText('Step');
    expect(select.textContent).toContain('Nessuno step');
    expect(optionNames(select)).toEqual([
      'Nessuno step',
      'Dati personali',
      'Dettagli',
    ]);
  });

  it('assigns a field to a step and can clear it back to none', () => {
    const onChange = vi.fn();
    const steps: FormStep[] = [{ id: 'step-1', title: 'Dati personali' }];
    renderRow(
      { id: 'f1', label: 'x', type: 'text', required: false },
      onChange,
      steps,
    );

    chooseOption(screen.getByLabelText('Step'), 'Dati personali');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-1' }),
    );
  });

  it('clears a step back to none', () => {
    const onChange = vi.fn();
    const steps: FormStep[] = [{ id: 'step-1', title: 'Dati personali' }];
    renderRow(
      { id: 'f1', label: 'x', type: 'text', required: false, stepId: 'step-1' },
      onChange,
      steps,
    );

    chooseOption(screen.getByLabelText('Step'), 'Nessuno step');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: null }),
    );
  });

  it('toggles required', () => {
    const onChange = vi.fn();
    renderRow(
      { id: 'f1', label: 'x', type: 'text', required: false },
      onChange,
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ required: true }),
    );
  });

  describe('show only when', () => {
    const reason: FormField = {
      id: 'reason',
      label: 'Motivo',
      type: 'select',
      required: true,
      options: ['Preventivo', 'Altro'],
    };
    const newsletter: FormField = {
      id: 'news',
      label: 'Newsletter',
      type: 'checkbox',
      required: false,
    };
    const details: FormField = {
      id: 'details',
      label: 'Specifica',
      type: 'text',
      required: false,
    };

    it('offers nothing to depend on for the first field', () => {
      renderRow(details);

      expect(screen.queryByLabelText('Mostra')).toBeNull();
    });

    it('offers only the fields above it', () => {
      renderRow(details, vi.fn(), [], [reason, newsletter]);

      expect(optionNames(screen.getByLabelText('Mostra'))).toEqual([
        'Sempre',
        'Solo se "Motivo"',
        'Solo se "Newsletter"',
      ]);
    });

    it('depends on a field with any answer, then narrows a select to one option', () => {
      const onChange = vi.fn();
      const { rerender } = renderRow(details, onChange, [], [reason]);

      chooseOption(screen.getByLabelText('Mostra'), 'Solo se "Motivo"');
      const withCondition = onChange.mock.lastCall?.[0];
      expect(withCondition.showWhen).toEqual({
        fieldId: 'reason',
        equals: null,
      });

      rerender(
        <TooltipProvider>
          <FormFieldEditorRow
            field={withCondition}
            onChange={onChange}
            onRemove={vi.fn()}
            onMoveUp={vi.fn()}
            onMoveDown={vi.fn()}
            canMoveUp={false}
            canMoveDown={false}
            steps={[]}
            earlierFields={[reason]}
          />
        </TooltipProvider>,
      );
      chooseOption(
        screen.getByLabelText('Risposta che mostra questo campo'),
        'è "Altro"',
      );
      expect(onChange.mock.lastCall?.[0].showWhen).toEqual({
        fieldId: 'reason',
        equals: 'Altro',
      });
    });

    it('says a checkbox condition means a ticked box, with no second choice', () => {
      renderRow(
        { ...details, showWhen: { fieldId: 'news', equals: null } },
        vi.fn(),
        [],
        [newsletter],
      );

      expect(screen.getByText('è spuntata')).toBeTruthy();
      expect(
        screen.queryByLabelText('Risposta che mostra questo campo'),
      ).toBeNull();
    });

    it('goes back to always shown', () => {
      const onChange = vi.fn();
      renderRow(
        { ...details, showWhen: { fieldId: 'reason', equals: null } },
        onChange,
        [],
        [reason],
      );

      chooseOption(screen.getByLabelText('Mostra'), 'Sempre');
      expect(onChange.mock.lastCall?.[0].showWhen).toBeNull();
    });
  });
});
