import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { uuidParamSchema } from '../common/schemas/common.schema';
import { ChallengesService } from './challenges.service';
import {
  challengeDayParamSchema,
  createChallengeSchema,
  updateChallengeSchema,
  type CreateChallengeInput,
  type UpdateChallengeInput,
} from './dto/challenge.schema';

const uuid = new ZodValidationPipe(uuidParamSchema);
const dayPipe = new ZodValidationPipe(challengeDayParamSchema);

@ApiTags('challenges')
@ApiBearerAuth()
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.challenges.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createChallengeSchema))
    dto: CreateChallengeInput,
  ) {
    return this.challenges.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateChallengeSchema))
    dto: UpdateChallengeInput,
  ) {
    return this.challenges.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.challenges.remove(user.id, id);
  }

  @Put(':id/checks/:day')
  check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('day', dayPipe) day: string,
  ) {
    return this.challenges.check(user.id, id, day);
  }

  @Delete(':id/checks/:day')
  uncheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('day', dayPipe) day: string,
  ) {
    return this.challenges.uncheck(user.id, id, day);
  }
}
