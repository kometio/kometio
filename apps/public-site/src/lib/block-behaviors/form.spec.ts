// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formBehaviors } from './form';
import { runBlockBehaviors } from './run-block-behaviors';

function renderMultiStepForm(): HTMLFormElement {
  document.body.innerHTML = `
    <div class="kometio-form">
      <form>
        <p data-step-indicator data-step-indicator-template="Passo {current} di {total}"></p>
        <div class="kometio-form__step" data-step-index="0">
          <input type="text" required />
        </div>
        <div class="kometio-form__step" data-step-index="1" hidden>
          <input type="text" />
        </div>
        <div class="kometio-form__step-nav">
          <button type="button" data-step-prev>Indietro</button>
          <button type="button" data-step-next>Avanti</button>
        </div>
        <button type="submit" data-step-submit hidden>Invia</button>
      </form>
    </div>
  `;
  return document.querySelector<HTMLFormElement>('.kometio-form form')!;
}

describe('formBehaviors', () => {
  it('is a no-op for a plain single-step form', () => {
    document.body.innerHTML = `
      <div class="kometio-form"><form><button type="submit">Invia</button></form></div>
    `;

    expect(() => runBlockBehaviors(document, formBehaviors)).not.toThrow();
  });

  it('shows only the first step and the indicator text on init', () => {
    renderMultiStepForm();

    runBlockBehaviors(document, formBehaviors);

    const steps = document.querySelectorAll<HTMLElement>('.kometio-form__step');
    expect(steps[0]?.hidden).toBe(false);
    expect(steps[1]?.hidden).toBe(true);
    expect(document.querySelector('[data-step-indicator]')?.textContent).toBe(
      'Passo 1 di 2',
    );
  });

  it('does not advance past a required field left empty', () => {
    renderMultiStepForm();
    runBlockBehaviors(document, formBehaviors);

    document.querySelector<HTMLInputElement>(
      '.kometio-form__step[data-step-index="0"] input',
    )!.reportValidity = () => false;
    document.querySelector<HTMLButtonElement>('[data-step-next]')!.click();

    const steps = document.querySelectorAll<HTMLElement>('.kometio-form__step');
    expect(steps[0]?.hidden).toBe(false);
    expect(steps[1]?.hidden).toBe(true);
  });

  it('advances to the next step and shows the submit button on the last one', () => {
    renderMultiStepForm();
    runBlockBehaviors(document, formBehaviors);
    document.querySelector<HTMLInputElement>(
      '.kometio-form__step[data-step-index="0"] input',
    )!.reportValidity = () => true;

    document.querySelector<HTMLButtonElement>('[data-step-next]')!.click();

    const steps = document.querySelectorAll<HTMLElement>('.kometio-form__step');
    expect(steps[0]?.hidden).toBe(true);
    expect(steps[1]?.hidden).toBe(false);
    expect(document.querySelector('[data-step-submit]')).toHaveProperty(
      'hidden',
      false,
    );
    expect(document.querySelector('[data-step-indicator]')?.textContent).toBe(
      'Passo 2 di 2',
    );
  });

  it('goes back a step on Indietro', () => {
    renderMultiStepForm();
    runBlockBehaviors(document, formBehaviors);
    document.querySelector<HTMLInputElement>(
      '.kometio-form__step[data-step-index="0"] input',
    )!.reportValidity = () => true;
    document.querySelector<HTMLButtonElement>('[data-step-next]')!.click();

    document.querySelector<HTMLButtonElement>('[data-step-prev]')!.click();

    const steps = document.querySelectorAll<HTMLElement>('.kometio-form__step');
    expect(steps[0]?.hidden).toBe(false);
    expect(steps[1]?.hidden).toBe(true);
  });

  it('is idempotent: a second run does not double-advance on one click', () => {
    renderMultiStepForm();
    runBlockBehaviors(document, formBehaviors);
    runBlockBehaviors(document, formBehaviors);
    document.querySelector<HTMLInputElement>(
      '.kometio-form__step[data-step-index="0"] input',
    )!.reportValidity = () => true;

    document.querySelector<HTMLButtonElement>('[data-step-next]')!.click();

    expect(document.querySelector('[data-step-indicator]')?.textContent).toBe(
      'Passo 2 di 2',
    );
  });

  describe('show-when conditions', () => {
    function renderConditionalForm(): HTMLFormElement {
      const conditions = JSON.stringify([
        { id: 'reason', showWhen: null },
        { id: 'details', showWhen: { fieldId: 'reason', equals: 'Other' } },
        { id: 'news', showWhen: null },
        { id: 'topics', showWhen: { fieldId: 'news', equals: null } },
      ]);
      document.body.innerHTML = `
        <div class="kometio-form">
          <form data-kometio-form-conditions='${conditions}'>
            <div data-kometio-form-field="reason">
              <select name="reason"><option value=""></option><option>Quote</option><option>Other</option></select>
            </div>
            <div data-kometio-form-field="details" hidden>
              <input name="details" required disabled />
            </div>
            <div data-kometio-form-field="news">
              <input type="checkbox" name="news" />
            </div>
            <div data-kometio-form-field="topics" hidden>
              <input name="topics" disabled />
            </div>
          </form>
        </div>
      `;
      return document.querySelector<HTMLFormElement>('.kometio-form form')!;
    }

    function field(id: string): HTMLElement {
      return document.querySelector<HTMLElement>(
        `[data-kometio-form-field="${id}"]`,
      )!;
    }

    it('shows a field once the select it depends on has its answer, and enables it', () => {
      const form = renderConditionalForm();
      runBlockBehaviors(document, formBehaviors);
      const reason = form.querySelector<HTMLSelectElement>('select')!;

      reason.value = 'Other';
      reason.dispatchEvent(new Event('change', { bubbles: true }));

      expect(field('details').hidden).toBe(false);
      expect(field('details').querySelector('input')!.disabled).toBe(false);
    });

    /*
     * Disabled, not only hidden: the browser neither validates nor
     * submits a disabled control, so a required field the visitor cannot
     * see never blocks the form, and an answer given before the condition
     * changed is not sent.
     */
    it('hides and disables it again when the answer changes back', () => {
      const form = renderConditionalForm();
      runBlockBehaviors(document, formBehaviors);
      const reason = form.querySelector<HTMLSelectElement>('select')!;

      reason.value = 'Other';
      reason.dispatchEvent(new Event('change', { bubbles: true }));
      reason.value = 'Quote';
      reason.dispatchEvent(new Event('change', { bubbles: true }));

      expect(field('details').hidden).toBe(true);
      expect(field('details').querySelector('input')!.disabled).toBe(true);
      expect(form.checkValidity()).toBe(true);
    });

    it('reads a ticked box as "any answer"', () => {
      const form = renderConditionalForm();
      runBlockBehaviors(document, formBehaviors);
      const news = form.querySelector<HTMLInputElement>('input[name="news"]')!;

      news.checked = true;
      news.dispatchEvent(new Event('change', { bubbles: true }));

      expect(field('topics').hidden).toBe(false);
    });

    it('leaves a form with no conditions alone', () => {
      document.body.innerHTML = `
        <div class="kometio-form"><form><div data-kometio-form-field="a" hidden><input name="a" disabled /></div></form></div>
      `;
      runBlockBehaviors(document, formBehaviors);

      expect(field('a').hidden).toBe(true);
    });
  });
});
