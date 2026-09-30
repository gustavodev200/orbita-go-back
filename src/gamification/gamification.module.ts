import { Global, Module } from '@nestjs/common';
import { BossService } from './boss.service';
import {
  AchievementsController,
  BossController,
  MissionsController,
  ShopController,
  StatsController,
  StreakController,
} from './gamification.controllers';
import { GamificationService } from './gamification.service';
import { MissionsService } from './missions.service';
import { ShopService } from './shop.service';
import { StatsService } from './stats.service';
import { StreakService } from './streak.service';

// Global: qualquer módulo de domínio premia via GamificationService.award().
@Global()
@Module({
  controllers: [
    MissionsController,
    StreakController,
    BossController,
    AchievementsController,
    ShopController,
    StatsController,
  ],
  providers: [
    GamificationService,
    MissionsService,
    StreakService,
    BossService,
    ShopService,
    StatsService,
  ],
  exports: [GamificationService],
})
export class GamificationModule {}
