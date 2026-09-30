import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

// Registro de outra conta (ou inexistente) nunca casa com o `where` por userId —
// responde 404 igual, sem revelar se o id pertence a outra pessoa.
export function mapNotFound(
  error: unknown,
  message = 'Não encontrado',
): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    return new NotFoundException(message);
  }
  return error;
}
