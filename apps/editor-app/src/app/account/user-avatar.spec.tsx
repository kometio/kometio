import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from './user-avatar';

const backgroundOf = (element: Element | null) =>
  [...(element?.classList ?? [])].find((name) => name.startsWith('bg-'));

describe('UserAvatar', () => {
  it('draws the picture when there is one, as decoration beside the name', () => {
    const { container } = render(
      <UserAvatar seed="u1" name="Giulia" imageUrl="https://cdn.test/g.webp" />,
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('https://cdn.test/g.webp');
    expect(image?.getAttribute('alt')).toBe('');
  });

  it('draws the first letter otherwise — a whole letter, in capitals', () => {
    const { container: accented } = render(
      <UserAvatar seed="u1" name="élodie" imageUrl={null} />,
    );
    const { container: emoji } = render(
      <UserAvatar seed="u2" name="🌻 Sole" imageUrl={null} />,
    );

    expect(accented.textContent).toBe('É');
    expect(emoji.textContent).toBe('🌻');
  });

  it('gives different people different colours, not one for everybody', () => {
    const colours = new Set(
      ['user-1', 'user-2', 'user-3', 'user-4', 'user-5', 'user-6'].map((seed) =>
        backgroundOf(
          render(<UserAvatar seed={seed} name="A" imageUrl={null} />).container
            .firstElementChild,
        ),
      ),
    );

    expect(colours.size).toBeGreaterThan(1);
  });

  it('keeps a person the same colour wherever they appear', () => {
    const first = render(
      <UserAvatar seed="user-42" name="A" imageUrl={null} />,
    );
    const again = render(
      <UserAvatar seed="user-42" name="B" imageUrl={null} />,
    );

    expect(backgroundOf(first.container.firstElementChild)).toBeDefined();
    expect(backgroundOf(first.container.firstElementChild)).toBe(
      backgroundOf(again.container.firstElementChild),
    );
  });
});
