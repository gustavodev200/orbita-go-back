import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { centsSchema } from '../common/schemas/common.schema';
import { BossService } from './boss.service';
import { GamificationService } from './gamification.service';
import { MissionsService } from './missions.service';
import { DEFAULT_BOSS_ATTACK_CENTS } from './rules';
import { ShopService } from './shop.service';
import { StatsService } from './stats.service';
import { StreakService } from './streak.service';

const keyParamSchema = z.string().regex(/^[a-z-]{1,40}$/, 'chave inválida');

const attackSchema = z
  .object({ amountCents: centsSchema.default(DEFAULT_BOSS_ATTACK_CENTS) })
  .strict()
  .default({ amountCents: DEFAULT_BOSS_ATTACK_CENTS });
type AttackInput = z.infer<typeof attackSchema>;

@ApiTags('missions')
@ApiBearerAuth()
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.missions.today(user.id);
  }

  @Post(':key/claim')
  @HttpCode(200)
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key', new ZodValidationPipe(keyParamSchema)) key: string,
  ) {
    return this.missions.claim(user.id, key);
  }
}

@ApiTags('streak')
@ApiBearerAuth()
@Controller('streak')
export class StreakController {
  constructor(private readonly streak: StreakService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.streak.get(user.id);
  }

  @Post('close-day')
  @HttpCode(200)
  closeDay(@CurrentUser() user: AuthenticatedUser) {
    return this.streak.closeDay(user.id);
  }

  @Post('shield')
  @HttpCode(200)
  shield(@CurrentUser() user: AuthenticatedUser) {
    return this.streak.useShield(user.id);
  }
}

@ApiTags('boss')
@ApiBearerAuth()
@Controller('boss')
export class BossController {
  constructor(private readonly boss: BossService) {}

  // Sem recorrente de saída no mês não há chefão: responde JSON `null`
  // (o retorno nil padrão do Nest viria com corpo vazio).
  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    res.json(await this.boss.get(user.id));
  }

  @Post('attack')
  @HttpCode(200)
  attack(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(attackSchema)) dto: AttackInput,
  ) {
    return this.boss.attack(user.id, dto.amountCents);
  }
}

@ApiTags('achievements')
@ApiBearerAuth()
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly gamification: GamificationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.gamification.listAchievements(user.id);
  }
}

@ApiTags('shop')
@ApiBearerAuth()
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.shop.list(user.id);
  }

  @Post(':key/buy')
  @HttpCode(200)
  buy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key', new ZodValidationPipe(keyParamSchema)) key: string,
  ) {
    return this.shop.buy(user.id, key);
  }
}

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('compare')
  compare(@CurrentUser() user: AuthenticatedUser) {
    return this.stats.compare(user.id);
  }
}
