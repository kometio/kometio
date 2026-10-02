import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StylePreview } from './style-preview';

function renderPreview(
  props: Partial<Parameters<typeof StylePreview>[0]> = {},
) {
  return render(
    <StylePreview
      primary="#123456"
      primaryForeground="#ffffff"
      font={null}
      {...props}
    />,
  );
}

describe('StylePreview', () => {
  it('draws a heading, a paragraph and a button in the colour it is given', () => {
    renderPreview();

    expect(screen.getByText('Un titolo di esempio')).toBeTruthy();
    expect(screen.getByText(/Un paragrafo/)).toBeTruthy();
    const button = screen.getByText('Un pulsante');
    expect(button.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(button.style.color).toBe('rgb(255, 255, 255)');
  });

  it('puts the editor’s own text colour on the editor’s own button colour, so it stays readable in both themes', () => {
    // A theme that writes its colours in oklch gives the preview no hex to
    // draw: the button is the editor's primary, and its text used to be
    // whatever the preview inherited — dark on blue in the light theme,
    // light on light blue in the dark one.
    renderPreview({ primary: undefined, primaryForeground: undefined });

    const style = screen.getByText('Un pulsante').getAttribute('style');
    expect(style).toContain('background-color: var(--primary)');
    expect(style).toContain('color: var(--primary-foreground)');
  });

  it('draws the font that was chosen, and leaves the editor’s own for the theme’s', () => {
    const { container, rerender } = renderPreview({ font: 'inter' });
    const sample = () =>
      container.querySelector<HTMLElement>('[style*="font-family"]');
    expect(sample()?.style.fontFamily).toContain('Inter');

    rerender(
      <StylePreview
        primary={undefined}
        primaryForeground={undefined}
        font={null}
      />,
    );
    expect(sample()).toBeNull();
  });

  it('says it is a rough preview of the form, not the site', () => {
    renderPreview();

    expect(screen.getByText(/Anteprima approssimata/)).toBeTruthy();
  });
});
