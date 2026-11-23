import {
  All,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { ApiTokensService } from '../api-tokens/api-tokens.service';
import { Public } from '../auth/public.decorator';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { buildMcpServer } from './mcp-server';

function bearer(request: Request): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
}

// Servidor MCP (Streamable HTTP, stateless) para o Claude salvar flashcards.
// @Public() libera do SupabaseJwtGuard: aqui a autenticação é o token pessoal
// (`orb_…`, criado em /api-tokens), nunca o JWT da sessão do app.
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly flashcards: FlashcardsService,
  ) {}

  @Public()
  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = bearer(req);
    const userId = token ? await this.tokens.authenticate(token) : null;
    if (!userId) throw new UnauthorizedException();

    const server = buildMcpServer(userId, this.flashcards);
    // Sem sessão e com resposta JSON simples: cabe numa função serverless.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    // O Nest já fez o parse do JSON — repassa o body para não reler o stream.
    await transport.handleRequest(req, res, req.body);
  }

  // Stateless: sem stream SSE (GET) nem encerramento de sessão (DELETE).
  @Public()
  @All()
  @HttpCode(405)
  methodNotAllowed(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Allow', 'POST');
    return {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    };
  }
}
