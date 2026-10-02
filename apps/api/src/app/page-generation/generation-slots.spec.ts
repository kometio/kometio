import { GenerationSlots } from './generation-slots';

describe('GenerationSlots', () => {
  it('gives each site its own few slots, and takes them back once each', () => {
    const slots = new GenerationSlots(2);

    const first = slots.take('site-a');
    const second = slots.take('site-a');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(slots.take('site-a')).toBeNull();
    // Another site is not held up by this one.
    expect(slots.take('site-b')).not.toBeNull();

    first?.();
    first?.(); // released twice counts once
    expect(slots.take('site-a')).not.toBeNull();
    expect(slots.take('site-a')).toBeNull();
  });
});
