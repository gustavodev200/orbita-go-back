import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { uuidParamSchema } from '../common/schemas/common.schema';
import {
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from './dto/note.schema';
import { NotesService } from './notes.service';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notes.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createNoteSchema)) dto: CreateNoteInput,
  ) {
    return this.notes.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) dto: UpdateNoteInput,
  ) {
    return this.notes.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.notes.remove(user.id, id);
  }
}
