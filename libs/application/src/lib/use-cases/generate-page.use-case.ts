import {
  PageGenerationFailedError,
  SecretUnreadableError,
  type Site,
} from '@kometio/domain-core';
import type {
  PageGenerationUsage,
  PageGeneratorConnection,
  PageGeneratorPort,
  SecretCipherPort,
  SiteAiSettingsRepositoryPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import type { Block } from '@kometio/shared-types';
import {
  assembleGeneratedPage,
  reported,
  type DroppedBlock,
} from '../page-generation/assemble-generated-page';
import {
  buildContextInstructions,
  buildStableInstructions,
} from '../page-generation/generation-instructions';
import { generatedPageJsonSchema } from '../page-generation/generation-output';
import { requireSite } from './require-site';

export interface GeneratePageDeps {
  siteRepository: SiteRepositoryPort;
  aiSettingsRepository: SiteAiSettingsRepositoryPort;
  cipher: SecretCipherPort;
  /** The adapter for the provider a site chose (Claude, OpenAI-compatible). */
  createGenerator: (connection: PageGeneratorConnection) => PageGeneratorPort;
}

/**
 * What a generation needs before it can start: the site, and how to reach
 * its provider with its key opened. Found before anything is streamed, so
 * a site that is not the tenant's, one with no provider, or a key that no
 * longer opens is an answer of its own and not an event in a stream.
 */
export interface PreparedPageGeneration {
  site: Site;
  connection: PageGeneratorConnection;
}

export async function preparePageGeneration(
  deps: Pick<
    GeneratePageDeps,
    'siteRepository' | 'aiSettingsRepository' | 'cipher'
  >,
  input: { tenantId: string; siteId: string },
): Promise<PreparedPageGeneration> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  const stored = await deps.aiSettingsRepository.get(
    input.tenantId,
    input.siteId,
  );
  if (!stored) throw new PageGenerationFailedError('not-configured');

  let apiKey = '';
  if (stored.apiKeySealed !== null) {
    try {
      apiKey = deps.cipher.open(stored.apiKeySealed);
    } catch (error) {
      if (error instanceof SecretUnreadableError) {
        throw new PageGenerationFailedError('key-unreadable');
      }
      throw error;
    }
  }
  return {
    site,
    connection: {
      provider: stored.provider,
      model: stored.model,
      apiKey,
      ...(stored.baseUrl === null ? {} : { baseUrl: stored.baseUrl }),
    },
  };
}

export interface GeneratePageInput {
  /** The page's language; the copy is written in it. */
  locale: string;
  prompt: string;
  /** For adding to a page that has content: its outline, top level. */
  existingOutline?: readonly string[];
  onProgress?: (receivedCharacters: number) => void;
  signal?: AbortSignal;
}

export interface GeneratedPage {
  /** The page's blocks, checked against the catalogue and their schemas, with ids. */
  content: Block[];
  dropped: DroppedBlock[];
  /** Blocks still holding a placeholder the person has to replace. */
  placeholderCount: number;
  model: string;
  usage: PageGenerationUsage;
}

/** Built once: the same on every call, which is what lets a provider cache it. */
const STABLE_INSTRUCTIONS = buildStableInstructions();
const OUTPUT_SCHEMA = generatedPageJsonSchema();

/**
 * Only names an icon could have. Whether the ACTIVE THEME draws it is
 * known to the public site, not here: the editor asks it before the page
 * reaches the canvas, and drops the ones it does not draw.
 */
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Writes a page from a prompt with the site's own provider and key, and
 * returns it as blocks — never saved here. The editor loads it as a draft
 * the person reviews, moves and edits like any other; nothing is published
 * and the page's history can take it back.
 */
export async function generatePage(
  deps: Pick<GeneratePageDeps, 'createGenerator'>,
  { site, connection }: PreparedPageGeneration,
  input: GeneratePageInput,
): Promise<GeneratedPage> {
  const result = await deps.createGenerator(connection).generate({
    stableInstructions: STABLE_INSTRUCTIONS,
    contextInstructions: buildContextInstructions({
      siteName: site.name,
      businessType: site.businessType,
      locale: input.locale,
      existingOutline: input.existingOutline,
    }),
    prompt: input.prompt,
    outputSchema: OUTPUT_SCHEMA,
    onProgress: input.onProgress,
    signal: input.signal,
  });

  const assembled = assembleGeneratedPage(result.answer, {
    locale: input.locale,
    hasIcon: (name) => ICON_NAME.test(name),
  });
  if (assembled.content.length === 0) {
    throw new PageGenerationFailedError('empty');
  }
  return {
    ...assembled,
    // The provider names its model: logged and returned, so bounded too.
    model: reported(result.model) ?? connection.model,
    usage: result.usage,
  };
}
