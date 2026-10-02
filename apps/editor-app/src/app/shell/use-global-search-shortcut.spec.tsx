import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGlobalSearchShortcut } from './use-global-search-shortcut';

function Harness({ onOpen }: { onOpen: () => void }) {
  useGlobalSearchShortcut(onOpen);
  return <input aria-label="campo" />;
}

describe('useGlobalSearchShortcut', () => {
  it.each([
    ['Ctrl+K', { ctrlKey: true }],
    ['⌘K', { metaKey: true }],
  ])(
    'opens on %s, and keeps the browser from taking the key',
    (_name, keys) => {
      const onOpen = vi.fn();
      render(<Harness onOpen={onOpen} />);

      const notCancelled = fireEvent.keyDown(document.body, {
        key: 'k',
        ...keys,
      });

      expect(onOpen).toHaveBeenCalledTimes(1);
      // preventDefault was called: the browser's own Ctrl+K did not run.
      expect(notCancelled).toBe(false);
    },
  );

  it('works from inside a field, where a person is when they think of searching', () => {
    const onOpen = vi.fn();
    const { getByLabelText } = render(<Harness onOpen={onOpen} />);

    fireEvent.keyDown(getByLabelText('campo'), { key: 'k', ctrlKey: true });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('ignores K on its own, and other combinations', () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);

    fireEvent.keyDown(document.body, { key: 'k' });
    fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls the latest handler, not the one it was attached with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness onOpen={first} />);
    rerender(<Harness onOpen={second} />);

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening when it is unmounted', () => {
    const onOpen = vi.fn();
    const { unmount } = render(<Harness onOpen={onOpen} />);
    unmount();

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

    expect(onOpen).not.toHaveBeenCalled();
  });
});
