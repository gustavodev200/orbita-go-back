import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
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
import { PushSenderService } from './push-sender.service';
import { PushService } from './push.service';

@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly sender: PushSenderService,
  ) {}

  @Post('subscribe')
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(subscribeSchema)) dto: SubscribeInput,
  ) {
    return this.push.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(unsubscribeSchema)) dto: UnsubscribeInput,
  ) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  /**
   * Notificação de teste para os aparelhos do próprio usuário — confirma o
   * caminho real (VAPID → inscrição → service worker), não só a permissão.
   */
  @Post('test')
  @HttpCode(200)
  async test(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ delivered: number }> {
    const delivered = await this.sender.sendToUser(user.id, {
      title: 'Notificações ativas',
      body: 'Tudo certo! Seus lembretes vão chegar por aqui.',
      url: '/agenda',
      tag: 'push-test',
    });
    return { delivered };
  }
}
