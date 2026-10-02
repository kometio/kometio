import type { GeneratePageDeps } from '@kometio/application';
import { PageGenerationDisabledError } from '@kometio/domain-core';
import type {
  SiteAiSettingsRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import type { GenerationSlots } from './generation-slots';

/** What only a deployment with a secrets key has: a way to seal a key, and the providers to spend it on. */
type Generation = Pick<GeneratePageDeps, 'cipher' | 'createGenerator'>;

/**
 * What page generation is built from, decided once when the API starts:
 * one token for the module's two controllers, and one place that says
 * whether the feature is on. The rule "no secrets key, no page
 * generation" was written out by hand in five places, and answered as a
 * 404 in one controller and an event in a 200 stream in the other.
 */
export class PageGenerationDeps {
  readonly siteRepository: SiteRepositoryPort;
  readonly aiSettingsRepository: SiteAiSettingsRepositoryPort;
  /** Pages written at once for each site (see GenerationSlots). */
  readonly slots: GenerationSlots;
  /** How long the server waits for a page. */
  readonly deadlineMs: number;
  private readonly generation: Generation | null;

  constructor(parts: {
    siteRepository: SiteRepositoryPort;
    aiSettingsRepository: SiteAiSettingsRepositoryPort;
    /** `null` when the deployment has nowhere to keep its secrets key. */
    generation: Generation | null;
    slots: GenerationSlots;
    deadlineMs: number;
  }) {
    this.siteRepository = parts.siteRepository;
    this.aiSettingsRepository = parts.aiSettingsRepository;
    this.generation = parts.generation;
    this.slots = parts.slots;
    this.deadlineMs = parts.deadlineMs;
  }

  /** Whether this deployment can keep an API key, and so write pages. */
  get enabled(): boolean {
    return this.generation !== null;
  }

  /** What saving a key and writing a page need — refused where the deployment has page generation off. */
  requireEnabled(): GeneratePageDeps {
    if (!this.generation) throw new PageGenerationDisabledError();
    return {
      siteRepository: this.siteRepository,
      aiSettingsRepository: this.aiSettingsRepository,
      ...this.generation,
    };
  }
}
