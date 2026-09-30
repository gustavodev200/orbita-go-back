import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Única porta de validação de entrada externa (body/query) desta feature —
// mesmo formato de mensagem de erro do `validateEnv` (common/config/env.schema.ts).
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(issues || 'Validation failed');
    }
    return result.data;
  }
}
