import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { McpController } from './mcp.controller';

@Module({
  imports: [ApiTokensModule, FlashcardsModule],
  controllers: [McpController],
})
export class McpModule {}
