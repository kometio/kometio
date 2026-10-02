import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PickedForm } from '@kometio/shared-types';
import {
  FormListContext,
  type FormListPort,
} from '../../forms/form-list-context';
import { FormPickerField } from './form-picker-field';

const form: PickedForm = { formId: 'f1', formName: 'Contatti' };

function wrapperWith(port: FormListPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <FormListContext.Provider value={port}>
        {children}
      </FormListContext.Provider>
    );
  };
}

describe('FormPickerField', () => {
  it('shows "Scegli modulo" and no name when value is null', () => {
    render(<FormPickerField value={null} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Scegli modulo')).toBeTruthy();
    expect(screen.queryByText('Contatti')).toBeNull();
  });

  it('shows the picked form name and "Cambia modulo" when a value is set', () => {
    render(<FormPickerField value={form} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Contatti')).toBeTruthy();
    expect(screen.getByText('Cambia modulo')).toBeTruthy();
  });

  it('calls onChange with the picked form when the port resolves one', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(form);
    render(<FormPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli modulo'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith(form);
  });

  it('does not call onChange when the picker is dismissed without a selection', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(null);
    render(<FormPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli modulo'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });
});
