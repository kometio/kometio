import { AnthropicPageGenerator } from '@kometio/anthropic-page-generator';
import { OpenAiCompatiblePageGenerator } from '@kometio/openai-compatible-page-generator';
import { PageGenerationFailedError } from '@kometio/domain-core';
import type {
  PageGeneratorConnection,
  PageGeneratorPort,
} from '@kometio/ports';

/** What the operator allows the API to reach (KOMETIO_AI_ALLOW_PRIVATE_HOSTS). */
export interface PageGeneratorNetwork {
  allowPrivateHosts: boolean;
}

/** The adapter for the provider a site chose, built per request with its key. */
export function createPageGenerator(
  connection: PageGeneratorConnection,
  network: PageGeneratorNetwork,
): PageGeneratorPort {
  switch (connection.provider) {
    case 'anthropic':
      return new AnthropicPageGenerator({
        apiKey: connection.apiKey,
        model: connection.model,
      });
    case 'openai-compatible':
      // The settings refuse this provider without an address; a row that
      // lacks one anyway is a site not configured, not an empty URL.
      if (!connection.baseUrl) {
        throw new PageGenerationFailedError('not-configured');
      }
      return new OpenAiCompatiblePageGenerator({
        baseUrl: connection.baseUrl,
        apiKey: connection.apiKey,
        model: connection.model,
        allowPrivateHosts: network.allowPrivateHosts,
      });
  }
}
