import { AnthropicPageGenerator } from '@kometio/anthropic-page-generator';
import { OpenAiCompatiblePageGenerator } from '@kometio/openai-compatible-page-generator';
import { PageGenerationFailedError } from '@kometio/domain-core';
import { createPageGenerator } from './page-generator.factory';

const closed = { allowPrivateHosts: false };

describe('createPageGenerator', () => {
  it('builds the adapter for the provider the site chose', () => {
    expect(
      createPageGenerator(
        {
          provider: 'anthropic',
          model: 'claude-opus-5',
          apiKey: 'sk-ant-an-invented-key',
        },
        closed,
      ),
    ).toBeInstanceOf(AnthropicPageGenerator);
    expect(
      createPageGenerator(
        {
          provider: 'openai-compatible',
          model: 'qwen3:14b',
          apiKey: '',
          baseUrl: 'http://localhost:11434/v1',
        },
        closed,
      ),
    ).toBeInstanceOf(OpenAiCompatiblePageGenerator);
  });

  it('refuses a server inside the network unless the operator allows it', async () => {
    const connection = {
      provider: 'openai-compatible' as const,
      model: 'qwen3:14b',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:9/v1',
    };
    const request = {
      stableInstructions: '',
      contextInstructions: '',
      prompt: 'x',
      outputSchema: {},
    };

    await expect(
      createPageGenerator(connection, closed).generate(request),
    ).rejects.toMatchObject({ failure: 'private-address' });
    // Allowed, it is tried: port 9 answers nothing, so it is unreachable.
    await expect(
      createPageGenerator(connection, {
        allowPrivateHosts: true,
      }).generate(request),
    ).rejects.toMatchObject({ failure: 'unreachable' });
  });

  it('calls an OpenAI-compatible provider with no address not configured', () => {
    expect(() =>
      createPageGenerator(
        { provider: 'openai-compatible', model: 'qwen3:14b', apiKey: '' },
        closed,
      ),
    ).toThrow(PageGenerationFailedError);
  });
});
