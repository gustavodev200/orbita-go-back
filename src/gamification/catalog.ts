// Catálogos fixos do jogo (conquistas, loja, missões) — constantes de código, não tabela.

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  hint: string;
}

export const ACHIEVEMENTS = [
  {
    key: 'primeiro-passo',
    title: 'Primeiro passo',
    description: 'Deu o primeiro passo na órbita',
    icon: 'flag',
    hint: 'Conclua o onboarding ou faça o primeiro lançamento',
  },
  {
    key: 'fogo-aceso',
    title: 'Fogo aceso',
    description: '7 dias de ofensiva',
    icon: 'local_fire_department',
    hint: 'Mantenha 7 dias seguidos de ofensiva',
  },
  {
    key: 'cacador-de-chefao',
    title: 'Caçador de chefão',
    description: 'Derrotou o chefão do mês',
    icon: 'swords',
    hint: 'Zere a vida do chefão do mês',
  },
  {
    key: 'olho-no-extrato',
    title: 'Olho no extrato',
    description: '30 lançamentos registrados',
    icon: 'visibility',
    hint: 'Registre 30 lançamentos',
  },
  {
    key: 'cofrinho',
    title: 'Cofrinho',
    description: 'Guardou dinheiro na 1ª meta',
    icon: 'savings',
    hint: 'Guarde dinheiro em uma meta',
  },
  {
    key: 'mao-de-vaca',
    title: 'Mão de vaca',
    description: 'Fechou um mês dentro do orçamento',
    icon: 'shield_with_heart',
    hint: 'Termine um mês com todos os orçamentos dentro do limite',
  },
  {
    key: 'fogo-eterno',
    title: 'Fogo eterno',
    description: '30 dias de ofensiva',
    icon: 'whatshot',
    hint: 'Mantenha 30 dias seguidos de ofensiva',
  },
  {
    key: 'zerou-a-trilha',
    title: 'Zerou a trilha',
    description: 'Concluiu uma meta',
    icon: 'emoji_events',
    hint: 'Conclua uma meta',
  },
  {
    key: 'madrugador',
    title: 'Madrugador',
    description: 'Fechou o dia antes das 9h',
    icon: 'wb_twilight',
    hint: 'Feche o dia antes das 9h',
  },
  {
    key: 'sem-dividas',
    title: 'Sem dívidas',
    description: '3 meses sem atraso',
    icon: 'verified',
    hint: 'Pague as recorrentes em dia por 3 meses',
  },
  {
    key: 'colecionador',
    title: 'Colecionador',
    description: 'Abriu 10 baús',
    icon: 'inventory_2',
    hint: 'Abra 10 baús nas trilhas das metas',
  },
  {
    key: 'lenda',
    title: 'Lenda',
    description: 'Chegou ao nível 20',
    icon: 'diamond',
    hint: 'Chegue ao nível 20',
  },
] as const satisfies readonly AchievementDef[];

export type AchievementKey = (typeof ACHIEVEMENTS)[number]['key'];

export function findAchievement(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.key === key);
}

export interface ShopItemDef {
  key: string;
  name: string;
  icon: string;
  price: number;
  /** Consumível (escudo): pode comprar várias vezes, nunca fica "owned". */
  consumable: boolean;
}

export const SHOP_ITEMS: readonly ShopItemDef[] = [
  {
    key: 'escudo',
    name: 'Escudo de ofensiva',
    icon: 'shield',
    price: 200,
    consumable: true,
  },
  {
    key: 'tema-noite-estrelada',
    name: 'Tema Noite Estrelada',
    icon: 'palette',
    price: 500,
    consumable: false,
  },
  {
    key: 'cobre-festa',
    name: 'Cobre de festa',
    icon: 'celebration',
    price: 350,
    consumable: false,
  },
  {
    key: 'cobre-soneca',
    name: 'Cobre soneca',
    icon: 'bedtime',
    price: 300,
    consumable: false,
  },
];

export type MissionKey =
  'registrar-lancamentos' | 'concluir-tarefas' | 'gastar-pouco';

export interface MissionDef {
  key: MissionKey;
  title: string;
  icon: string;
  target: number;
  /** Unidade de `target`/`progress` — evita o front deduzir pela magnitude. */
  unit: 'count' | 'cents';
  xp: number;
  coins: number;
}

export const MISSIONS: readonly MissionDef[] = [
  {
    key: 'registrar-lancamentos',
    title: 'Registre 3 lançamentos',
    icon: 'edit_note',
    target: 3,
    unit: 'count',
    xp: 20,
    coins: 5,
  },
  {
    key: 'concluir-tarefas',
    title: 'Conclua 2 tarefas',
    icon: 'task_alt',
    target: 2,
    unit: 'count',
    xp: 15,
    coins: 5,
  },
  // progress = centavos gastos hoje; só completa depois de fechar o dia abaixo do teto.
  {
    key: 'gastar-pouco',
    title: 'Gaste menos de R$ 80 hoje',
    icon: 'savings',
    target: 8000,
    unit: 'cents',
    xp: 25,
    coins: 10,
  },
];

export function isMissionComplete(
  mission: MissionDef,
  progress: number,
  closedToday: boolean,
): boolean {
  if (mission.key === 'gastar-pouco') {
    return closedToday && progress < mission.target;
  }
  return progress >= mission.target;
}
