# @kometio/openai-compatible-page-generator

The `PageGeneratorPort` adapter for any server that speaks the OpenAI chat
completions API: OpenAI, Ollama (`http://localhost:11434/v1`), LM Studio,
OpenRouter. Plain `fetch`, no SDK: what it depends on is the protocol.

It streams `/chat/completions` with a JSON Schema `response_format`. A server
that does not enforce the schema may still answer outside it, which is why
`@kometio/application` reads every answer leniently and checks each block
itself. Failures are thrown as `PageGenerationFailedError`, like the Claude
adapter's.
