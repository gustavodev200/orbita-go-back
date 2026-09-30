import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  monthQuerySchema,
  uuidParamSchema,
  type MonthQuery,
} from '../common/schemas/common.schema';
import {
  createRecurringSchema,
  upcomingQuerySchema,
  updateRecurringSchema,
  type CreateRecurringInput,
  type UpcomingQuery,
  type UpdateRecurringInput,
} from './dto/recurring.schema';
import { RecurringsService } from './recurrings.service';

@ApiTags('recurrings')
@ApiBearerAuth()
@Controller('recurrings')
export class RecurringsController {
  constructor(private readonly recurrings: RecurringsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery,
  ) {
    return this.recurrings.list(user.id, query.month);
  }

  @Get('upcoming')
  upcoming(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(upcomingQuerySchema)) query: UpcomingQuery,
  ) {
    return this.recurrings.upcoming(user.id, query.days);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createRecurringSchema))
    dto: CreateRecurringInput,
  ) {
    return this.recurrings.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Body(new ZodValidationPipe(updateRecurringSchema))
    dto: UpdateRecurringInput,
  ) {
    return this.recurrings.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
  ) {
    return this.recurrings.remove(user.id, id);
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidParamSchema)) id: string,
    @Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery,
  ) {
    return this.recurrings.pay(user.id, id, query.month);
  }
}
