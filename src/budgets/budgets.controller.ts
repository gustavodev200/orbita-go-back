import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  monthQuerySchema,
  type MonthQuery,
} from '../common/schemas/common.schema';
import { BudgetsService } from './budgets.service';
import { putBudgetsSchema, type PutBudgetsInput } from './dto/budget.schema';

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(monthQuerySchema)) query: MonthQuery,
  ) {
    return this.budgets.list(user.id, query.month);
  }

  @Put()
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(putBudgetsSchema)) dto: PutBudgetsInput,
  ) {
    return this.budgets.replace(user.id, dto);
  }
}
