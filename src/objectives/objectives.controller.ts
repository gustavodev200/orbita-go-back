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
  createMilestoneSchema,
  createObjectiveSchema,
  updateMilestoneSchema,
  updateObjectiveSchema,
  type CreateMilestoneInput,
  type CreateObjectiveInput,
  type UpdateMilestoneInput,
  type UpdateObjectiveInput,
} from './dto/objective.schema';
import { ObjectivesService } from './objectives.service';

const uuid = new ZodValidationPipe(uuidParamSchema);

@ApiTags('objectives')
@ApiBearerAuth()
@Controller('objectives')
export class ObjectivesController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.objectives.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createObjectiveSchema))
    dto: CreateObjectiveInput,
  ) {
    return this.objectives.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateObjectiveSchema))
    dto: UpdateObjectiveInput,
  ) {
    return this.objectives.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.objectives.remove(user.id, id);
  }

  @Post(':id/milestones')
  addMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createMilestoneSchema))
    dto: CreateMilestoneInput,
  ) {
    return this.objectives.addMilestone(user.id, id, dto);
  }

  @Patch(':id/milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('milestoneId', uuid) milestoneId: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema))
    dto: UpdateMilestoneInput,
  ) {
    return this.objectives.updateMilestone(user.id, id, milestoneId, dto);
  }

  @Delete(':id/milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('milestoneId', uuid) milestoneId: string,
  ) {
    return this.objectives.removeMilestone(user.id, id, milestoneId);
  }

  @Put(':id/tasks/:taskId')
  linkTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('taskId', uuid) taskId: string,
  ) {
    return this.objectives.linkTask(user.id, id, taskId, true);
  }

  @Delete(':id/tasks/:taskId')
  unlinkTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('taskId', uuid) taskId: string,
  ) {
    return this.objectives.linkTask(user.id, id, taskId, false);
  }

  @Put(':id/habits/:habitId')
  linkHabit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('habitId', uuid) habitId: string,
  ) {
    return this.objectives.linkHabit(user.id, id, habitId, true);
  }

  @Delete(':id/habits/:habitId')
  unlinkHabit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('habitId', uuid) habitId: string,
  ) {
    return this.objectives.linkHabit(user.id, id, habitId, false);
  }
}
