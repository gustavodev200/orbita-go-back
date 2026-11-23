import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { uuidParamSchema } from '../common/schemas/common.schema';
import {
  createFlashcardsSchema,
  listFlashcardsQuerySchema,
  reviewFlashcardSchema,
  reviewQueueQuerySchema,
  updateFlashcardSchema,
  type CreateFlashcardsInput,
  type ListFlashcardsQuery,
  type ReviewFlashcardInput,
  type ReviewQueueQuery,
  type UpdateFlashcardInput,
} from './dto/flashcard.schema';
import { FlashcardsService } from './flashcards.service';

@ApiTags('flashcards')
@ApiBearerAuth()
@Controller('flashcards')
export class FlashcardsController {
  constructor(private readonly flashcards: FlashcardsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listFlashcardsQuerySchema))
    query: ListFlashcardsQuery,
  ) {
    return this.flashcards.list(user.id, query.q);
  }

  @Get('review')
  reviewQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reviewQueueQuerySchema))
    query: ReviewQueueQuery,
  ) {
    return this.flashcards.reviewQueue(user.id, query.limit);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFlashcardsSchema))
    dto: CreateFlashcardsInput,
  ) {
    return this.flashcards.create(user.id, dto.cards);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateFlashcardSchema))
    dto: UpdateFlashcardInput,
  ) {
    return this.flashcards.update(user.id, id, dto);
  }

  @Post(':id/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Body(new ZodValidationPipe(reviewFlashcardSchema))
    dto: ReviewFlashcardInput,
  ) {
    return this.flashcards.review(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.flashcards.remove(user.id, id);
  }
}
