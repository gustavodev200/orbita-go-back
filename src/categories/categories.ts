export type CategoryType = 'expense' | 'income';

export interface Category {
  key: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
}

// Fixas (cores do README do design, iguais nos dois temas). Chaves = ids do protótipo.
export const CATEGORIES: readonly Category[] = [
  {
    key: 'ali',
    name: 'Alimentação',
    icon: 'restaurant',
    color: '#FF8A1E',
    type: 'expense',
  },
  {
    key: 'mer',
    name: 'Mercado',
    icon: 'shopping_cart',
    color: '#20B878',
    type: 'expense',
  },
  {
    key: 'tra',
    name: 'Transporte',
    icon: 'directions_car',
    color: '#2E8BEF',
    type: 'expense',
  },
  { key: 'cas', name: 'Casa', icon: 'home', color: '#8B5CF6', type: 'expense' },
  {
    key: 'laz',
    name: 'Lazer',
    icon: 'sports_esports',
    color: '#EC4E9C',
    type: 'expense',
  },
  {
    key: 'sau',
    name: 'Saúde',
    icon: 'medication',
    color: '#EE5A4F',
    type: 'expense',
  },
  {
    key: 'ass',
    name: 'Assinaturas',
    icon: 'subscriptions',
    color: '#12B3C4',
    type: 'expense',
  },
  {
    key: 'edu',
    name: 'Educação',
    icon: 'school',
    color: '#D39500',
    type: 'expense',
  },
  { key: 'pet', name: 'Pets', icon: 'pets', color: '#B5703A', type: 'expense' },
  {
    key: 'rou',
    name: 'Roupas',
    icon: 'apparel',
    color: '#6A7BD8',
    type: 'expense',
  },
  {
    key: 'out',
    name: 'Outros',
    icon: 'more_horiz',
    color: '#9A8C7E',
    type: 'expense',
  },
  {
    key: 'sal',
    name: 'Salário',
    icon: 'payments',
    color: '#2E8BEF',
    type: 'income',
  },
  {
    key: 'fre',
    name: 'Freela',
    icon: 'work',
    color: '#20B878',
    type: 'income',
  },
  {
    key: 'inv',
    name: 'Rendimentos',
    icon: 'trending_up',
    color: '#8B5CF6',
    type: 'income',
  },
  {
    key: 'pre',
    name: 'Presente',
    icon: 'redeem',
    color: '#EC4E9C',
    type: 'income',
  },
];

export const CATEGORY_KEYS = CATEGORIES.map((category) => category.key);

// Onboarding já traz Educação e Pets desmarcadas (design).
export const DEFAULT_ENABLED_CATEGORY_KEYS = CATEGORY_KEYS.filter(
  (key) => key !== 'edu' && key !== 'pet',
);

export function findCategory(key: string): Category | undefined {
  return CATEGORIES.find((category) => category.key === key);
}

export function isCategoryOfType(key: string, type: CategoryType): boolean {
  return findCategory(key)?.type === type;
}
