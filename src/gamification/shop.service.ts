import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toMe, type Me } from '../users/me';
import { SHOP_ITEMS } from './catalog';

export interface ShopItemView {
  key: string;
  name: string;
  icon: string;
  price: number;
  owned: boolean;
}

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ShopItemView[]> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ownedItems: true },
    });
    return SHOP_ITEMS.map((item) => ({
      key: item.key,
      name: item.name,
      icon: item.icon,
      price: item.price,
      owned: !item.consumable && user.ownedItems.includes(item.key),
    }));
  }

  async buy(userId: string, key: string): Promise<Me> {
    const item = SHOP_ITEMS.find((i) => i.key === key);
    if (!item) throw new NotFoundException('Item não encontrado');
    return this.prisma.transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!item.consumable && user.ownedItems.includes(item.key)) {
        throw new ConflictException('Item já comprado');
      }
      // Débito condicional: nunca deixa saldo negativo mesmo com compras concorrentes.
      const debited = await tx.user.updateMany({
        where: { id: userId, coins: { gte: item.price } },
        data: {
          coins: { decrement: item.price },
          ...(item.consumable
            ? { shields: { increment: 1 } }
            : { ownedItems: { push: item.key } }),
        },
      });
      if (debited.count === 0) {
        throw new BadRequestException('Moedas insuficientes');
      }
      return toMe(await tx.user.findUniqueOrThrow({ where: { id: userId } }));
    });
  }
}
