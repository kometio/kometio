import {
  publishPageTranslation,
  type PublishPageTranslationDeps,
} from './publish-page-translation.use-case';

export interface PublishDuePageTranslationsInput {
  tenantId: string;
  /** The clock, for the tests. */
  now?: Date;
  /** How many one tick takes; the next takes the rest. */
  batchSize?: number;
}

export interface PublishDuePageTranslationsResult {
  /** Online now, whatever happened after. */
  published: number;
  /** Not published; still scheduled, with the reason on the page, and tried again at the next tick. */
  failed: number;
  /** Published, but the search index did not take it: the page is live and its words are not searchable until it is published again. A subset of `published`. */
  notIndexed: number;
}

const DEFAULT_BATCH = 50;
const REASON_LIMIT = 500;

/**
 * What a tick of the API does (docs/adr/0135): publishes every language
 * whose moment has come, each as the person who scheduled it.
 *
 * One at a time and each on its own: a page that cannot be published is
 * written down as such — on the page, where somebody will look — and does
 * not hold up the ones behind it. It stays scheduled, because what fails here
 * is nearly always something that passes a minute later; a person who would
 * rather not have it tried again cancels it.
 */
export async function publishDuePageTranslations(
  deps: PublishPageTranslationDeps,
  input: PublishDuePageTranslationsInput,
): Promise<PublishDuePageTranslationsResult> {
  const now = input.now ?? new Date();
  const due = await deps.pageTranslationRepository.listDueForPublish(
    input.tenantId,
    now,
    input.batchSize ?? DEFAULT_BATCH,
  );
  const result: PublishDuePageTranslationsResult = {
    published: 0,
    failed: 0,
    notIndexed: 0,
  };

  for (const translation of due) {
    try {
      await publishPageTranslation(deps, {
        tenantId: input.tenantId,
        pageTranslationId: translation.id,
        actorUserId: translation.scheduledBy,
      });
      result.published += 1;
    } catch (error) {
      // Read again rather than trusted: publishing writes the page and then
      // indexes it, and a failure of the second is a page that is online.
      const current = await deps.pageTranslationRepository.findById(
        input.tenantId,
        translation.id,
      );
      if (current === null) continue;
      if (current.scheduledPublishAt === null) {
        result.published += 1;
        result.notIndexed += 1;
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      current.recordScheduleFailure(reason.slice(0, REASON_LIMIT));
      await deps.pageTranslationRepository.saveSchedule(current);
      result.failed += 1;
    }
  }
  return result;
}
