import { businessDay, dateToDay } from '../common/time/business-time';
import type { User } from '../generated/prisma/client';
import { effectiveStreak, XP_TO_NEXT } from '../gamification/rules';

export interface Me {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  onboarded: boolean;
  level: number;
  xp: number;
  xpToNext: typeof XP_TO_NEXT;
  coins: number;
  streak: number;
  streakRecord: number;
  shields: number;
  theme: 'light' | 'dark' | 'system';
  monthlyIncomeCents: number | null;
  ownedItems: string[];
  enabledCategoryKeys: string[];
  notificationsEnabled: boolean;
}

export function toMe(user: User, today: string = businessDay()): Me {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    onboarded: user.onboarded,
    level: user.level,
    xp: user.xp,
    xpToNext: XP_TO_NEXT,
    coins: user.coins,
    streak: effectiveStreak(
      user.streak,
      user.lastClosedDay ? dateToDay(user.lastClosedDay) : null,
      today,
    ),
    streakRecord: user.streakRecord,
    shields: user.shields,
    theme: user.theme,
    monthlyIncomeCents: user.monthlyIncomeCents,
    ownedItems: user.ownedItems,
    enabledCategoryKeys: user.enabledCategoryKeys,
    notificationsEnabled: user.notificationsEnabled,
  };
}
