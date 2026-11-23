import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { uuidParamSchema } from '../common/schemas/common.schema';
import { ApiTokensService } from './api-tokens.service';
import {
  createApiTokenSchema,
  type CreateApiTokenInput,
} from './dto/api-token.schema';

// Gerenciado só com a sessão do app (JWT Supabase): um token pessoal nunca
// consegue criar/listar/revogar tokens — ele só abre o /mcp.
@ApiTags('api-tokens')
@ApiBearerAuth()
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tokens.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createApiTokenSchema)) dto: CreateApiTokenInput,
  ) {
    return this.tokens.create(user.id, dto.name);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.tokens.remove(user.id, id);
  }
}
