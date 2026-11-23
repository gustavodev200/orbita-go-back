import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiTokensService } from '../api-tokens/api-tokens.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { McpController } from './mcp.controller';

const ACCEPT = 'application/json, text/event-stream';

describe('POST /mcp (HTTP)', () => {
  let app: INestApplication<App>;
  type RpcBody = {
    result: { serverInfo: { name: string }; content: { text: string }[] };
  };
  const authenticate = jest.fn((token: string) =>
    Promise.resolve(token === 'orb_good' ? 'u1' : null),
  );
  const create = jest.fn().mockResolvedValue({
    created: [{ pt: 'cansado', en: 'tired' }],
    skipped: [],
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: ApiTokensService, useValue: { authenticate } },
        { provide: FlashcardsService, useValue: { create } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(() => app.close());

  const rpc = (body: object, token = 'orb_good') =>
    request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', ACCEPT)
      .send(body);

  it('sem token válido responde 401', async () => {
    await rpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      'orb_bad',
    ).expect(401);
  });

  it('GET responde 405', async () => {
    await request(app.getHttpServer()).get('/mcp').expect(405);
  });

  it('initialize + tools/call add_flashcards salva para o dono do token', async () => {
    const init = await rpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    }).expect(200);
    expect((init.body as RpcBody).result.serverInfo.name).toBe('orbitago');

    const call = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'add_flashcards',
        arguments: { cards: [{ pt: 'cansado', en: 'tired' }] },
      },
    }).expect(200);

    expect(create).toHaveBeenCalledWith('u1', [{ pt: 'cansado', en: 'tired' }]);
    expect((call.body as RpcBody).result.content[0].text).toContain(
      '+ cansado → tired',
    );
  });
});
