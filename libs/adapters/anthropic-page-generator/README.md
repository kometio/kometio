# @kometio/anthropic-page-generator

The `PageGeneratorPort` adapter for Claude, through the official
`@anthropic-ai/sdk`. It writes a page from a prompt as JSON held to the page
schema by structured output (`output_config.format`), caches the block
catalogue (the same on every call), and streams the answer so the editor can
show progress.

- Default model: `claude-opus-5`. On it, a request the model declines is
  re-run on another model by the API (`fallbacks: "default"`), instead of
  simply stopping.
- Failures are thrown as `PageGenerationFailedError` with a code
  (`refused`, `truncated`, `not-json`, `rejected-credentials`,
  `rate-limited`, `unreachable`); a cancellation is rethrown as it is.

The answer is returned unchecked: `@kometio/application` checks every block
against the catalogue (`assembleGeneratedPage`).
