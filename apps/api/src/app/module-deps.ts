import type { FactoryProvider, InjectionToken } from '@nestjs/common';

/**
 * A module's deps object (docs/adr/0094): one provider holding every port
 * its use cases are built from, each key naming the token its value comes
 * from. The module's controllers take the whole object and hand it to a
 * use case as it is — `publishPage(this.deps, input)` — instead of each
 * handler assembling its own bundle from a dozen injected fields.
 *
 * Keys are the names the use cases already give each port
 * (`siteRepository`, `mediaStorage`), so one object satisfies every use
 * case of the module; a use case asks for a `Pick` of it.
 */
export function moduleDeps<T extends object>(
  provide: InjectionToken,
  tokens: { readonly [K in keyof T]-?: InjectionToken },
): FactoryProvider<T> {
  const entries = Object.entries<InjectionToken>(tokens);
  return {
    provide,
    inject: entries.map(([, token]) => token),
    useFactory: (...values: unknown[]) =>
      // Nest's tokens carry no type: that SITE_REPOSITORY holds a
      // SiteRepositoryPort is the promise `@Inject(SITE_REPOSITORY)
      // siteRepository: SiteRepositoryPort` made on every controller
      // field, made here once per module instead.
      Object.fromEntries(
        entries.map(([key], index) => [key, values[index]]),
      ) as T,
  };
}
