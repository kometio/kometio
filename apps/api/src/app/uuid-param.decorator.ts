import { Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const uuidSchema = z.string().uuid();

/**
 * A path parameter that names a row by its id. Every id in the schema is a
 * uuid, and anything else is the caller's mistake: a 400 said here, where
 * the request is read, instead of the 500 Postgres gave once the text
 * reached a uuid column ("invalid input syntax for type uuid").
 */
export function UuidParam(name: string): ParameterDecorator {
  return Param(name, new ZodValidationPipe(uuidSchema));
}
