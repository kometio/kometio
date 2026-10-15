import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StarterPicker, type StarterPickerProps } from './starter-picker';

// The suite runs pinned to Italian (test-setup.ts): the copy below is Italian.
function renderPicker(props: Partial<StarterPickerProps> = {}) {
  const onApply = vi.fn().mockResolvedValue(undefined);
  const onBlank = vi.fn();
  render(<StarterPicker onApply={onApply} onBlank={onBlank} {...props} />);
  return { onApply, onBlank };
}

const choose = (name: RegExp) =>
  fireEvent.click(screen.getByRole('radio', { name }));
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: /continua/i }));

describe('StarterPicker', () => {
  it('offers the three examples and a blank page, with nothing chosen for the person', () => {
    renderPicker();

    const options = screen.getAllByRole('radio');

    expect(
      options.map((option) => option.getAttribute('aria-checked')),
    ).toEqual(['false', 'false', 'false', 'false']);
    expect(
      screen.getByRole('radio', { name: /studio o servizi/i }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: /portfolio/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /blog/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /pagina vuota/i })).toBeTruthy();
  });

  it('says what each one makes, so that the choice is not made by its name', () => {
    renderPicker();

    expect(screen.getByText(/home, servizi, chi siamo/i)).toBeTruthy();
    expect(screen.getByText(/tre progetti di esempio/i)).toBeTruthy();
    expect(screen.getByText(/ultimi articoli per categoria/i)).toBeTruthy();
  });

  it('asks for a choice when Continue is pressed with none, and makes nothing', () => {
    const { onApply, onBlank } = renderPicker();

    submit();

    expect(screen.getByRole('alert').textContent).toMatch(/scegli un esempio/i);
    expect(onApply).not.toHaveBeenCalled();
    expect(onBlank).not.toHaveBeenCalled();
  });

  it('takes the sentence away as soon as something is chosen', () => {
    renderPicker();
    submit();

    choose(/portfolio/i);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('makes the example that was chosen', async () => {
    const { onApply, onBlank } = renderPicker();

    choose(/blog/i);
    submit();

    await waitFor(() => expect(onApply).toHaveBeenCalledWith('blog'));
    expect(onBlank).not.toHaveBeenCalled();
  });

  it('goes on with the blank page without making anything', () => {
    const { onApply, onBlank } = renderPicker();

    choose(/pagina vuota/i);
    submit();

    expect(onBlank).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says, before anything is made, when the site’s language has no examples of its own', () => {
    renderPicker({ fallbackLanguageName: 'francese' });

    expect(screen.getByText(/il tuo sito è in francese/i).textContent).toMatch(
      /arrivano in inglese/i,
    );
  });

  it('says nothing about the language when the examples are in it', () => {
    renderPicker();

    expect(screen.queryByText(/arrivano in inglese/i)).toBeNull();
  });

  it('shows why it failed, keeps the choice, and can be pressed again', async () => {
    const { onApply } = renderPicker({
      error: 'L’esempio non è stato creato. Riprova.',
    });

    choose(/studio/i);

    expect(screen.getByRole('alert').textContent).toMatch(
      /non è stato creato/i,
    );
    expect(
      screen
        .getByRole('radio', { name: /studio/i })
        .getAttribute('aria-checked'),
    ).toBe('true');
    submit();
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('studio'));
  });

  it('holds still while it works', () => {
    renderPicker({ pending: true });

    const button = screen.getByRole('button', { name: /sto creando/i });

    expect(button.hasAttribute('disabled')).toBe(true);
  });

  describe('an example whose theme this installation does not have', () => {
    it('is listed, says which theme is missing, and cannot be chosen', () => {
      renderPicker({ unavailable: { blog: 'paper' } });

      const blog = screen.getByRole('radio', { name: /blog/i });

      expect(blog.hasAttribute('disabled')).toBe(true);
      expect(screen.getByText(/tema «paper»/i)).toBeTruthy();
      expect(
        screen
          .getByRole('radio', { name: /portfolio/i })
          .hasAttribute('disabled'),
      ).toBe(false);
    });

    it('does not make one when continuing with it', async () => {
      const { onApply } = renderPicker({ unavailable: { blog: 'paper' } });

      choose(/blog/i);
      submit();

      await waitFor(() =>
        expect(screen.getByText(/scegli un esempio/i)).toBeTruthy(),
      );
      expect(onApply).not.toHaveBeenCalled();
    });
  });
});
