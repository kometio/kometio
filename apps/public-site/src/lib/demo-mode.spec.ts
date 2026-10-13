import { describe, expect, it } from 'vitest';
import { isDemoDeployment } from './demo-mode';

describe('isDemoDeployment', () => {
  it('is true only where KOMETIO_DEMO says `true`', () => {
    expect(isDemoDeployment({ KOMETIO_DEMO: 'true' })).toBe(true);
    expect(isDemoDeployment({ KOMETIO_DEMO: 'false' })).toBe(false);
    expect(isDemoDeployment({ KOMETIO_DEMO: '' })).toBe(false);
    expect(isDemoDeployment({ KOMETIO_DEMO: 'TRUE' })).toBe(false);
    expect(isDemoDeployment({})).toBe(false);
  });
});
