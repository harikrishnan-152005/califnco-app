
export type ProductCategory =
  | 'All'
  | 'RO Purifiers'
  | 'UV Purifiers'
  | 'Spare Parts'
  | 'Dispensers'
  | 'Pumps';

export type Product = {
  id: string;
  name: string;
  type: string;
  price: number;
  category: Exclude<ProductCategory, 'All'>;
  emoji: string;
  color: string;
};

const families = [
  { name: 'Aqua Pro', type: 'RO + UV Water Purifier', category: 'RO Purifiers' as const, price: 12499, emoji: '💧', color: '#DCEFFB' },
  { name: 'Pure Max', type: 'Copper + RO Purifier', category: 'RO Purifiers' as const, price: 15999, emoji: '🚰', color: '#E4F3E8' },
  { name: 'Fresh Mini', type: 'Compact UV Purifier', category: 'UV Purifiers' as const, price: 7499, emoji: '✨', color: '#F9EAD8' },
  { name: 'Filter Kit', type: 'Replacement Filter', category: 'Spare Parts' as const, price: 1299, emoji: '🔧', color: '#ECE5FA' },
  { name: 'Water Station', type: 'Hot & Cold Dispenser', category: 'Dispensers' as const, price: 8999, emoji: '🚰', color: '#DCEFFB' },
  { name: 'Flow Pump', type: 'Booster Water Pump', category: 'Pumps' as const, price: 2199, emoji: '⚙️', color: '#E4F3E8' },
  { name: 'Aqua Shield', type: 'Advanced RO Purifier', category: 'RO Purifiers' as const, price: 13999, emoji: '💧', color: '#DCEFFB' },
  { name: 'UV Guard', type: 'UV Water Purifier', category: 'UV Purifiers' as const, price: 6499, emoji: '✨', color: '#F9EAD8' },
  { name: 'Sediment Filter', type: 'Replacement Sediment Filter', category: 'Spare Parts' as const, price: 499, emoji: '🔧', color: '#ECE5FA' },
  { name: 'Smart Dispenser', type: 'Tabletop Water Dispenser', category: 'Dispensers' as const, price: 3999, emoji: '🚰', color: '#DCEFFB' },
];

const variants = [
  { suffix: 'Standard', multiplier: 1 },
  { suffix: 'Plus', multiplier: 1.1 },
  { suffix: 'Premium', multiplier: 1.2 },
  { suffix: 'Compact', multiplier: 0.9 },
  { suffix: 'Pro', multiplier: 1.3 },
];

export const products: Product[] = families.flatMap((family, familyIndex) =>
  variants.map((variant, variantIndex) => ({
    id: `${familyIndex + 1}-${variantIndex + 1}`,
    name: `${family.name} ${variant.suffix}`,
    type: family.type,
    category: family.category,
    price: Math.round((family.price * variant.multiplier) / 100) * 100,
    emoji: family.emoji,
    color: family.color,
  }))
);

export const categories: ProductCategory[] = [
  'All',
  'RO Purifiers',
  'UV Purifiers',
  'Spare Parts',
  'Dispensers',
  'Pumps',
];
