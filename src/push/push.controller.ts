import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  subscribeSchema,
  unsubscribeSchema,
  type SubscribeInput,
  type UnsubscribeInput,
} from './dto/push-subscription.schema';
import { PushService } from './push.service';

@ApiTags('push')
@ApiBearerAuth()
@Controller('push/subscribe')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(subscribeSchema)) dto: SubscribeInput,
  ) {
    return this.push.subscribe(user.id, dto);
  }

  @Delete()
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(unsubscribeSchema)) dto: UnsubscribeInput,
  ) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }
}
