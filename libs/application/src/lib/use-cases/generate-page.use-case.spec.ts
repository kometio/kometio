import {
  PageGenerationFailedError,
  SiteNotFoundError,
} from '@kometio/domain-core';
import type {
  PageGenerationRequest,
  PageGenerationResult,
  PageGeneratorConnection,
} from '@kometio/ports';
import {
  buildSite,
  FakeSecretCipher,
  InMemorySiteAiSettingsRepository,
  InMemorySiteRepository,
} from '@kometio/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  generatePage,
  preparePageGeneration,
  type GeneratePageDeps,
} from './generate-page.use-case';
import { updateSiteAiSettings } from './site-ai-settings.use-cases';

const at = { tenantId: 'tenant-1', siteId: 'site-1' };

describe('generatePage', () => {
  let deps: GeneratePageDeps;
  let requests: PageGenerationRequest[];
  let connections: PageGeneratorConnection[];
  let answer: unknown;

  beforeEach(async () => {
    const sites = new InMemorySiteRepository();
    await sites.add(
      buildSite({ name: 'Forno Aurelio', businessType: 'Bakery' }),
    );
    requests = [];
    connections = [];
    answer = {
      blocks: [
        {
          ref: 'hero',
          parent: null,
          type: 'Hero',
          props: {
            eyebrow: '',
            title: 'Pane ogni mattina',
            subtitle: '<p>Dal 1987</p>',
          },
        },
        {
          ref: 'cta',
          parent: 'hero',
          type: 'Button',
          props: { label: 'Ordina', url: '' },
        },
        { ref: 't', parent: null, type: 'Testimonials', props: {} },
        {
          ref: 't1',
          parent: 't',
          type: 'Testimonial',
          props: { quote: 'Buonissimo.' },
        },
        { ref: 'g', parent: null, type: 'FeatureGrid', props: {} },
        {
          ref: 'f',
          parent: 'g',
          type: 'Feature',
          props: {
            icon: 'Not An Icon!',
            title: 'Lievito madre',
            text: 'Ogni giorno.',
          },
        },
      ],
    };
    deps = {
      siteRepository: sites,
      aiSettingsRepository: new InMemorySiteAiSettingsRepository(),
      cipher: new FakeSecretCipher(),
      createGenerator: (connection) => {
        connections.push(connection);
        return {
          generate: async (request): Promise<PageGenerationResult> => {
            requests.push(request);
            request.onProgress?.(42);
            return {
              answer,
              model: 'claude-opus-5',
              usage: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 3 },
            };
          },
        };
      },
    };
    await updateSiteAiSettings(deps, {
      ...at,
      settings: {
        provider: 'anthropic',
        model: 'claude-opus-5',
        baseUrl: null,
        apiKey: 'sk-ant-an-invented-key',
      },
    });
  });

  async function generate(input: Parameters<typeof generatePage>[2]) {
    return generatePage(deps, await preparePageGeneration(deps, at), input);
  }

  it("writes the page with the site's provider and returns it as checked blocks", async () => {
    const progress: number[] = [];
    const page = await generate({
      locale: 'it',
      prompt: 'La home di un forno',
      onProgress: (received) => progress.push(received),
    });

    expect(connections).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-opus-5',
        apiKey: 'sk-ant-an-invented-key',
      },
    ]);
    expect(page.content.map((block) => block.type)).toEqual([
      'Hero',
      'Testimonials',
      'FeatureGrid',
    ]);
    expect(page.content[1].children?.[0].props).toMatchObject({
      author: '[Nome del cliente]',
    });
    // A name no icon could have is dropped; the theme check is the editor's.
    expect(page.content[2].children?.[0].props['icon']).toBeNull();
    expect(page).toMatchObject({
      placeholderCount: 1,
      model: 'claude-opus-5',
      dropped: [],
    });
    expect(progress).toEqual([42]);
  });

  it('tells the model the catalogue, the site and the language, apart', async () => {
    await generate({
      locale: 'it',
      prompt: 'Aggiungi le domande frequenti',
      existingOutline: ['Hero: Pane ogni mattina'],
    });

    const [request] = requests;
    expect(request.stableInstructions).toContain('- Faq (top level)');
    expect(request.stableInstructions).not.toContain('Forno Aurelio');
    expect(request.contextInstructions).toContain('"Forno Aurelio", a Bakery');
    expect(request.contextInstructions).toContain(
      'Write everything in Italian (it)',
    );
    expect(request.contextInstructions).toContain('- Hero: Pane ogni mattina');
    expect(request.prompt).toBe('Aggiungi le domande frequenti');
    expect(JSON.stringify(request.outputSchema)).toContain('"blocks"');
  });

  it('says so when nothing the model wrote could be kept', async () => {
    answer = { blocks: [{ ref: 'x', parent: null, type: 'Form', props: {} }] };
    await expect(generate({ locale: 'en', prompt: 'x' })).rejects.toMatchObject(
      { failure: 'empty' },
    );
  });

  it('opens the key for the generator before anything is asked of it', async () => {
    const prepared = await preparePageGeneration(deps, at);
    expect(prepared.site.name).toBe('Forno Aurelio');
    expect(prepared.connection).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: 'sk-ant-an-invented-key',
    });
    expect(connections).toEqual([]);
  });

  it('refuses a site with no provider, and a site that is not the tenant own', async () => {
    const unconfigured = preparePageGeneration(
      {
        ...deps,
        aiSettingsRepository: new InMemorySiteAiSettingsRepository(),
      },
      at,
    );
    await expect(unconfigured).rejects.toBeInstanceOf(
      PageGenerationFailedError,
    );
    await expect(unconfigured).rejects.toMatchObject({
      failure: 'not-configured',
    });

    await expect(
      preparePageGeneration(deps, { tenantId: 'tenant-2', siteId: 'site-1' }),
    ).rejects.toBeInstanceOf(SiteNotFoundError);
  });

  it('says so when the key no longer opens', async () => {
    // The secrets key it was sealed with is gone.
    const aiSettings = new InMemorySiteAiSettingsRepository();
    await aiSettings.save(at.tenantId, at.siteId, {
      provider: 'anthropic',
      model: 'claude-opus-5',
      baseUrl: null,
      apiKeySealed: 'v1.lost-key.iv.tag.ct',
      apiKeyHint: 'Q7x2',
    });
    await expect(
      preparePageGeneration({ ...deps, aiSettingsRepository: aiSettings }, at),
    ).rejects.toMatchObject({ failure: 'key-unreadable' });
  });
});
