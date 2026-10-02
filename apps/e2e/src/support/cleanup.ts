/**
 * What a test made and must remove, whatever way the test ends.
 *
 * Registered right after each thing is created, so a test that fails
 * halfway still removes what it got as far as making. Undone newest first
 * (a page before the form it embeds), and every step is tried even when
 * one fails, so one refusal does not leave the rest behind.
 */
export class Cleanup {
  private readonly steps: Array<() => Promise<unknown>> = [];

  add(step: () => Promise<unknown>): void {
    this.steps.push(step);
  }

  async run(): Promise<void> {
    const failures: unknown[] = [];
    for (const step of [...this.steps].reverse()) {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw failures[0];
  }
}
