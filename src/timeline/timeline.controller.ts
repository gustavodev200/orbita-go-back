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
  createLifeEventSchema,
  updateLifeEventSchema,
  type CreateLifeEventInput,
  type UpdateLifeEventInput,
} from './dto/life-event.schema';
import { TimelineService } from './timeline.service';

const uuid = new ZodValidationPipe(uuidParamSchema);

@ApiTags('timeline')
@ApiBearerAuth()
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.timeline.get(user.id);
  }

  @Post('events')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLifeEventSchema))
    dto: CreateLifeEventInput,
  ) {
    return this.timeline.createEvent(user.id, dto);
  }

  @Patch('events/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateLifeEventSchema))
    dto: UpdateLifeEventInput,
  ) {
    return this.timeline.updateEvent(user.id, id, dto);
  }

  @Delete('events/:id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.timeline.removeEvent(user.id, id);
  }
}
