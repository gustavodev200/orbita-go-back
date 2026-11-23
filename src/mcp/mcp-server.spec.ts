import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { FlashcardsService } from '../flashcards/flashcards.service';
import { buildMcpServer } from './mcp-server';

const open: Client[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

async function connect(flashcards: Partial<FlashcardsService>) {
  const server = buildMcpServer('u1', flashcards as FlashcardsService);
  const client = new Client({ name: 'test', version: '1.0.0' });
  open.push(client);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as { type: string; text: string }[])
    .map((c) => c.text)
    .join('\n');
}

describe('MCP órbitaGO', () => {
  it('expõe add_flashcards e list_flashcards', async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_flashcards',
      'list_flashcards',
    ]);
  });

  it('add_flashcards normaliza e salva para o dono do token', async () => {
    const create = jest.fn().mockResolvedValue({
      created: [{ pt: 'dona de casa', en: 'homemaker' }],
      skipped: [{ pt: 'trabalho', en: 'work' }],
    });
    const client = await connect({ create });

    const result = await client.callTool({
      name: 'add_flashcards',
      arguments: {
        cards: [
          { pt: '  dona  de casa ', en: 'homemaker', example: '' },
          { pt: 'trabalho', en: 'work' },
        ],
      },
    });

    expect(create).toHaveBeenCalledWith('u1', [
      { pt: 'dona de casa', en: 'homemaker', example: null },
      { pt: 'trabalho', en: 'work' },
    ]);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('+ dona de casa → homemaker');
    expect(textOf(result)).toContain('= trabalho → work');
  });

  it('add_flashcards recusa termo vazio sem salvar', async () => {
    const create = jest.fn();
    const client = await connect({ create });

    const result = await client.callTool({
      name: 'add_flashcards',
      arguments: { cards: [{ pt: '   ', en: 'work' }] },
    });

    expect(result.isError).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
