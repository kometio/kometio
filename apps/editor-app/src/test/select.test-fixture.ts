import { fireEvent, screen } from '@testing-library/react';

/**
 * Picks an option from one of the editor's selects (OptionsSelect, or the
 * Radix Select under it), the way a person does: open it, click the
 * option. The menu is only in the DOM while it is open, so its options
 * cannot be found, or changed with `fireEvent.change`, the way a native
 * `<select>`'s could.
 */
export function chooseOption(
  trigger: HTMLElement,
  name: string | RegExp,
): void {
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name }));
}

/** The options a select offers, by their visible names — opens it to read them, and leaves it open. */
export function optionNames(trigger: HTMLElement): string[] {
  fireEvent.click(trigger);
  return screen
    .getAllByRole('option')
    .map((option) => option.textContent?.trim() ?? '');
}
