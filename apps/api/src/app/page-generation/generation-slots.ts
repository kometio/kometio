/**
 * How many pages are being written at once for each site, in this API
 * process. A generation is paid by the site's owner and holds a connection
 * for minutes: however many editors ask, from however many addresses, a
 * site only ever has a few in flight.
 *
 * A singleton of its own, not a field of the controller: the controller is
 * built per request (it depends on the request-scoped tenant context), so a
 * count kept there would start at zero every time.
 */
export class GenerationSlots {
  private readonly running = new Map<string, number>();

  constructor(private readonly perSite: number) {}

  /** A slot for this site, released by calling what it returns; `null` when none is free. */
  take(siteId: string): (() => void) | null {
    const inUse = this.running.get(siteId) ?? 0;
    if (inUse >= this.perSite) return null;
    this.running.set(siteId, inUse + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.running.get(siteId) ?? 1) - 1;
      if (left > 0) this.running.set(siteId, left);
      else this.running.delete(siteId);
    };
  }
}
