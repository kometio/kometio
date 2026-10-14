import type { ExecutionContext } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

/**
 * What a guard, a filter or an interceptor is handed, as Nest makes it
 * (`ExecutionContextHost` is its own implementation, not a stand-in): the
 * request and response given, a controller and a handler with the names given
 * — the guards that tell routes apart read them — and `metadata` set on the
 * handler as a decorator would (`{ roles: ['admin'] }` is `@Roles('admin')`).
 */
export function executionContextOf({
  request = {},
  response = {},
  handler = 'handler',
  controller = 'Controller',
  metadata = {},
}: {
  request?: object;
  response?: object;
  handler?: string;
  controller?: string;
  metadata?: Record<string, unknown>;
} = {}): ExecutionContext {
  const handlerFn = Object.defineProperty(() => undefined, 'name', {
    value: handler,
  });
  for (const [key, value] of Object.entries(metadata)) {
    SetMetadata(key, value)(handlerFn);
  }
  const controllerClass = Object.defineProperty(class {}, 'name', {
    value: controller,
  });
  return new ExecutionContextHost(
    [request, response],
    controllerClass,
    handlerFn,
  );
}
