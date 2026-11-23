import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createFlashcardsSchema } from '../flashcards/dto/flashcard.schema';
import type { FlashcardsService } from '../flashcards/flashcards.service';

const INSTRUCTIONS = `órbitaGO — vocabulário de inglês da pessoa (brasileira, nível A1→B1).
Quando ela escrever uma palavra/expressão em português no meio de uma frase em inglês,
é porque não sabe a tradução: depois de corrigir a frase, chame add_flashcards com cada termo
(pt = como ela escreveu, en = tradução no contexto, example = frase curta e simples em inglês).
Use list_flashcards para ver o que ela já tem antes de repetir explicações.`;

// Schemas planos para o JSON Schema que o modelo vê; a validação de verdade
// (trim, limites, vazio → null) é o mesmo Zod da rota REST, dentro do handler.
const cardShape = z.object({
  pt: z.string().describe('Termo em português, como a pessoa escreveu'),
  en: z.string().describe('Tradução em inglês no contexto da frase'),
  example: z
    .string()
    .optional()
    .describe('Frase de exemplo curta e simples, em inglês'),
  note: z
    .string()
    .optional()
    .describe('Observação curta em português (ex.: outro sentido da palavra)'),
});

function text(value: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: value }], isError };
}

/** Um McpServer por requisição (modo stateless), já preso ao dono do token. */
export function buildMcpServer(
  userId: string,
  flashcards: FlashcardsService,
): McpServer {
  const server = new McpServer(
    { name: 'orbitago', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'add_flashcards',
    {
      title: 'Adicionar flashcards',
      description:
        'Salva cards de vocabulário (português → inglês) no órbitaGO. Pares pt/en já existentes são ignorados.',
      inputSchema: { cards: z.array(cardShape).min(1).max(50) },
    },
    async (args) => {
      const parsed = createFlashcardsSchema.safeParse(args);
      if (!parsed.success) {
        return text(
          `Dados inválidos: ${parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
          true,
        );
      }
      const { created, skipped } = await flashcards.create(
        userId,
        parsed.data.cards,
      );
      const lines = [
        `${created.length} card(s) salvo(s).`,
        ...created.map((c) => `+ ${c.pt} → ${c.en}`),
        ...(skipped.length
          ? [
              `${skipped.length} já existia(m):`,
              ...skipped.map((c) => `= ${c.pt} → ${c.en}`),
            ]
          : []),
      ];
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'list_flashcards',
    {
      title: 'Listar flashcards',
      description:
        'Lista o vocabulário salvo (mais recentes primeiro), com filtro opcional por texto em pt ou en.',
      inputSchema: {
        query: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const cards = await flashcards.list(userId, query?.trim() || undefined);
      const shown = cards.slice(0, limit ?? 50);
      if (shown.length === 0) return text('Nenhum card encontrado.');
      return text(
        shown
          .map(
            (c) =>
              `${c.pt} → ${c.en} (acertos ${c.correctCount}, erros ${c.wrongCount})`,
          )
          .join('\n'),
      );
    },
  );

  return server;
}
