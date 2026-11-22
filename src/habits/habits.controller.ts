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
import {
  createHabitSchema,
  habitDayParamSchema,
  updateHabitSchema,
  type CreateHabitInput,
  type UpdateHabitInput,
} from './dto/habit.schema';
import { HabitsService } from './habits.service';

@ApiTags('habits')
@ApiBearerAuth()
@Controller('habits')
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.habits.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createHabitSchema)) dto: CreateHabitInput,
  ) {
    return this.habits.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateHabitSchema)) dto: UpdateHabitInput,
  ) {
    return this.habits.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.habits.remove(user.id, id);
  }

  @Put(':id/checks/:day')
  check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Param('day', new ZodValidationPipe(habitDayParamSchema)) day: string,
  ) {
    return this.habits.check(user.id, id, day);
  }

  @Delete(':id/checks/:day')
  uncheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Param('day', new ZodValidationPipe(habitDayParamSchema)) day: string,
  ) {
    return this.habits.uncheck(user.id, id, day);
  }
}
