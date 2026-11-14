// The collectible catalogue (plan.md §4.9, D48): static data, the same on the server (rolls) and in
// the web app (album, reveal). Art is Kenney's Furniture Kit (CC0, placeholder until the bedroom's
// own art); each item has four isometric sprites, `<sprite>_<NE|NW|SE|SW>.png` under
// apps/web/public/assets/collectibles. Footprints and surfaces are first guesses that the bedroom
// (Phase 7) will tune. Keys are stored in the database: never rename or remove one.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const CATEGORIES = [
  'beds',
  'seating',
  'tables',
  'storage',
  'lighting',
  'plants',
  'tech',
  'decor',
  'rugs',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_NAMES: Record<Category, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables & desks',
  storage: 'Storage',
  lighting: 'Lighting',
  plants: 'Plants',
  tech: 'Tech',
  decor: 'Decor',
  rugs: 'Rugs',
};

export const RARITY_NAMES: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** Themed sets (a cosmetic grouping; set-completion bonuses are in the backlog). */
export type ItemSet = 'basics' | 'study' | 'cozy' | 'modern';

/** Where an item can go in the bedroom: on the floor, on a wall, or on top of a desk or table. */
export type Surface = 'floor' | 'wall' | 'top';

export const DIRECTIONS = ['SE', 'SW', 'NE', 'NW'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface Collectible {
  key: string;
  name: string;
  category: Category;
  rarity: Rarity;
  set: ItemSet;
  /** The art's base name: `<sprite>_<direction>.png`. */
  sprite: string;
  /** Grid cells it takes (width × depth). */
  footprint: { w: number; h: number };
  surface: Surface;
}

type Row = [
  key: string,
  name: string,
  category: Category,
  rarity: Rarity,
  set: ItemSet,
  sprite: string,
  w: number,
  h: number,
  surface: Surface,
];

const ROWS: Row[] = [
  // Beds
  ['bed-single', 'Single bed', 'beds', 'common', 'basics', 'bedSingle', 1, 2, 'floor'],
  ['bed-bunk', 'Bunk bed', 'beds', 'uncommon', 'basics', 'bedBunk', 1, 2, 'floor'],
  ['bed-double', 'Double bed', 'beds', 'rare', 'cozy', 'bedDouble', 2, 2, 'floor'],
  // Seating
  ['chair', 'Wooden chair', 'seating', 'common', 'basics', 'chair', 1, 1, 'floor'],
  [
    'chair-cushion',
    'Cushioned chair',
    'seating',
    'common',
    'basics',
    'chairCushion',
    1,
    1,
    'floor',
  ],
  ['stool-bar', 'Bar stool', 'seating', 'common', 'basics', 'stoolBar', 1, 1, 'floor'],
  ['ottoman', 'Ottoman', 'seating', 'common', 'cozy', 'loungeSofaOttoman', 1, 1, 'floor'],
  [
    'chair-rounded',
    'Rounded chair',
    'seating',
    'uncommon',
    'basics',
    'chairRounded',
    1,
    1,
    'floor',
  ],
  ['chair-desk', 'Desk chair', 'seating', 'uncommon', 'study', 'chairDesk', 1, 1, 'floor'],
  [
    'bench-cushion',
    'Cushioned bench',
    'seating',
    'uncommon',
    'cozy',
    'benchCushion',
    2,
    1,
    'floor',
  ],
  ['lounge-chair', 'Armchair', 'seating', 'uncommon', 'cozy', 'loungeChair', 1, 1, 'floor'],
  [
    'chair-modern',
    'Modern chair',
    'seating',
    'rare',
    'modern',
    'chairModernCushion',
    1,
    1,
    'floor',
  ],
  [
    'lounge-relax',
    'Reading armchair',
    'seating',
    'rare',
    'cozy',
    'loungeChairRelax',
    1,
    1,
    'floor',
  ],
  ['sofa', 'Sofa', 'seating', 'rare', 'cozy', 'loungeSofa', 2, 1, 'floor'],
  [
    'design-chair',
    'Designer armchair',
    'seating',
    'epic',
    'modern',
    'loungeDesignChair',
    1,
    1,
    'floor',
  ],
  ['design-sofa', 'Designer sofa', 'seating', 'epic', 'modern', 'loungeDesignSofa', 2, 1, 'floor'],
  [
    'corner-sofa',
    'Corner sofa',
    'seating',
    'legendary',
    'modern',
    'loungeDesignSofaCorner',
    2,
    2,
    'floor',
  ],
  // Tables & desks
  ['table', 'Table', 'tables', 'common', 'basics', 'table', 2, 1, 'floor'],
  ['side-table', 'Side table', 'tables', 'common', 'basics', 'sideTable', 1, 1, 'floor'],
  ['table-round', 'Round table', 'tables', 'common', 'basics', 'tableRound', 1, 1, 'floor'],
  [
    'side-drawers',
    'Bedside drawers',
    'tables',
    'uncommon',
    'basics',
    'sideTableDrawers',
    1,
    1,
    'floor',
  ],
  ['coffee-table', 'Coffee table', 'tables', 'uncommon', 'cozy', 'tableCoffee', 2, 1, 'floor'],
  ['desk', 'Desk', 'tables', 'uncommon', 'study', 'desk', 2, 1, 'floor'],
  [
    'coffee-glass',
    'Glass coffee table',
    'tables',
    'rare',
    'modern',
    'tableCoffeeGlass',
    2,
    1,
    'floor',
  ],
  ['table-glass', 'Glass table', 'tables', 'rare', 'modern', 'tableGlass', 2, 1, 'floor'],
  ['desk-corner', 'Corner desk', 'tables', 'epic', 'study', 'deskCorner', 2, 2, 'floor'],
  // Storage
  [
    'box-closed',
    'Cardboard box',
    'storage',
    'common',
    'basics',
    'cardboardBoxClosed',
    1,
    1,
    'floor',
  ],
  ['box-open', 'Open box', 'storage', 'common', 'basics', 'cardboardBoxOpen', 1, 1, 'floor'],
  ['bookcase-low', 'Low bookcase', 'storage', 'common', 'study', 'bookcaseOpenLow', 1, 1, 'floor'],
  ['coat-stand', 'Coat stand', 'storage', 'common', 'basics', 'coatRackStanding', 1, 1, 'floor'],
  ['bookcase', 'Bookcase', 'storage', 'uncommon', 'study', 'bookcaseOpen', 1, 1, 'floor'],
  [
    'bookcase-closed',
    'Closed bookcase',
    'storage',
    'uncommon',
    'basics',
    'bookcaseClosed',
    1,
    1,
    'floor',
  ],
  ['tv-cabinet', 'TV cabinet', 'storage', 'uncommon', 'cozy', 'cabinetTelevision', 2, 1, 'floor'],
  [
    'bookcase-wide',
    'Wide bookcase',
    'storage',
    'rare',
    'study',
    'bookcaseClosedWide',
    2,
    1,
    'floor',
  ],
  // Lighting
  [
    'lamp-round-table',
    'Round desk lamp',
    'lighting',
    'common',
    'study',
    'lampRoundTable',
    1,
    1,
    'top',
  ],
  [
    'lamp-square-table',
    'Square desk lamp',
    'lighting',
    'common',
    'study',
    'lampSquareTable',
    1,
    1,
    'top',
  ],
  [
    'lamp-round-floor',
    'Round floor lamp',
    'lighting',
    'uncommon',
    'cozy',
    'lampRoundFloor',
    1,
    1,
    'floor',
  ],
  [
    'lamp-square-floor',
    'Square floor lamp',
    'lighting',
    'uncommon',
    'modern',
    'lampSquareFloor',
    1,
    1,
    'floor',
  ],
  ['lamp-wall', 'Wall lamp', 'lighting', 'rare', 'modern', 'lampWall', 1, 1, 'wall'],
  ['ceiling-fan', 'Ceiling fan', 'lighting', 'epic', 'modern', 'ceilingFan', 2, 2, 'floor'],
  // Plants
  ['plant-small-1', 'Little cactus', 'plants', 'common', 'basics', 'plantSmall1', 1, 1, 'top'],
  ['plant-small-2', 'Little fern', 'plants', 'common', 'basics', 'plantSmall2', 1, 1, 'top'],
  ['plant-small-3', 'Little succulent', 'plants', 'uncommon', 'cozy', 'plantSmall3', 1, 1, 'top'],
  ['potted-plant', 'Potted plant', 'plants', 'rare', 'cozy', 'pottedPlant', 1, 1, 'floor'],
  // Tech
  ['keyboard', 'Keyboard', 'tech', 'common', 'study', 'computerKeyboard', 1, 1, 'top'],
  ['mouse', 'Mouse', 'tech', 'common', 'study', 'computerMouse', 1, 1, 'top'],
  ['monitor', 'Monitor', 'tech', 'uncommon', 'study', 'computerScreen', 1, 1, 'top'],
  ['radio', 'Radio', 'tech', 'uncommon', 'cozy', 'radio', 1, 1, 'top'],
  ['speaker-small', 'Small speaker', 'tech', 'uncommon', 'modern', 'speakerSmall', 1, 1, 'top'],
  ['laptop', 'Laptop', 'tech', 'rare', 'study', 'laptop', 1, 1, 'top'],
  ['speaker', 'Speaker', 'tech', 'rare', 'modern', 'speaker', 1, 1, 'floor'],
  [
    'coffee-machine',
    'Coffee machine',
    'tech',
    'rare',
    'study',
    'kitchenCoffeeMachine',
    1,
    1,
    'top',
  ],
  ['tv-vintage', 'Vintage TV', 'tech', 'epic', 'cozy', 'televisionVintage', 1, 1, 'top'],
  ['tv-modern', 'Big-screen TV', 'tech', 'legendary', 'modern', 'televisionModern', 2, 1, 'top'],
  // Decor
  ['books', 'Stack of books', 'decor', 'common', 'study', 'books', 1, 1, 'top'],
  ['pillow', 'Pillow', 'decor', 'common', 'cozy', 'pillow', 1, 1, 'top'],
  ['pillow-blue', 'Blue pillow', 'decor', 'common', 'cozy', 'pillowBlue', 1, 1, 'top'],
  ['trash-can', 'Waste bin', 'decor', 'common', 'basics', 'trashcan', 1, 1, 'floor'],
  ['pillow-long', 'Long pillow', 'decor', 'uncommon', 'cozy', 'pillowLong', 1, 1, 'top'],
  ['coat-rack', 'Coat rack', 'decor', 'uncommon', 'basics', 'coatRack', 1, 1, 'wall'],
  ['bear', 'Teddy bear', 'decor', 'legendary', 'cozy', 'bear', 1, 1, 'top'],
  // Rugs
  ['rug-doormat', 'Doormat', 'rugs', 'common', 'basics', 'rugDoormat', 1, 1, 'floor'],
  ['rug-square', 'Square rug', 'rugs', 'common', 'basics', 'rugSquare', 2, 2, 'floor'],
  ['rug-round', 'Round rug', 'rugs', 'uncommon', 'cozy', 'rugRound', 2, 2, 'floor'],
  ['rug-rectangle', 'Long rug', 'rugs', 'uncommon', 'basics', 'rugRectangle', 2, 1, 'floor'],
  ['rug-rounded', 'Soft rug', 'rugs', 'rare', 'cozy', 'rugRounded', 2, 2, 'floor'],
  // More bedroom pieces from the same kit (D48, 2026-11-14; kitchen and bathroom left out).
  ['bench', 'Wooden bench', 'seating', 'common', 'basics', 'bench', 2, 1, 'floor'],
  ['stool-square', 'Square stool', 'seating', 'common', 'basics', 'stoolBarSquare', 1, 1, 'floor'],
  ['table-cloth', 'Table with cloth', 'tables', 'common', 'cozy', 'tableCloth', 2, 1, 'floor'],
  ['table-trestle', 'Trestle table', 'tables', 'common', 'basics', 'tableCross', 2, 1, 'floor'],
  [
    'bedside-cabinet',
    'Bedside cabinet',
    'storage',
    'common',
    'basics',
    'cabinetBed',
    1,
    1,
    'floor',
  ],
  [
    'bench-low',
    'Low cushioned bench',
    'seating',
    'uncommon',
    'cozy',
    'benchCushionLow',
    2,
    1,
    'floor',
  ],
  [
    'bookcase-doors',
    'Bookcase with doors',
    'storage',
    'uncommon',
    'study',
    'bookcaseClosedDoors',
    1,
    1,
    'floor',
  ],
  [
    'coffee-square',
    'Square coffee table',
    'tables',
    'uncommon',
    'cozy',
    'tableCoffeeSquare',
    1,
    1,
    'floor',
  ],
  [
    'trestle-cloth',
    'Trestle table with cloth',
    'tables',
    'uncommon',
    'cozy',
    'tableCrossCloth',
    2,
    1,
    'floor',
  ],
  [
    'bedside-table',
    'Bedside table',
    'tables',
    'uncommon',
    'basics',
    'cabinetBedDrawerTable',
    1,
    1,
    'floor',
  ],
  [
    'tv-cabinet-doors',
    'TV cabinet with doors',
    'storage',
    'rare',
    'modern',
    'cabinetTelevisionDoors',
    2,
    1,
    'floor',
  ],
  [
    'chair-frame',
    'Framed modern chair',
    'seating',
    'rare',
    'modern',
    'chairModernFrameCushion',
    1,
    1,
    'floor',
  ],
  [
    'coffee-glass-square',
    'Square glass table',
    'tables',
    'rare',
    'modern',
    'tableCoffeeGlassSquare',
    1,
    1,
    'floor',
  ],
  [
    'lamp-ceiling',
    'Ceiling lamp',
    'lighting',
    'rare',
    'modern',
    'lampSquareCeiling',
    1,
    1,
    'floor',
  ],
  ['sofa-long', 'Long sofa', 'seating', 'epic', 'cozy', 'loungeSofaLong', 3, 1, 'floor'],
  ['tv-antenna', 'TV with antenna', 'tech', 'epic', 'cozy', 'televisionAntenna', 1, 1, 'top'],
  [
    'sofa-corner',
    'L-shaped sofa',
    'seating',
    'legendary',
    'cozy',
    'loungeSofaCorner',
    2,
    2,
    'floor',
  ],
];

export const CATALOGUE: readonly Collectible[] = ROWS.map(
  ([key, name, category, rarity, set, sprite, w, h, surface]) => ({
    key,
    name,
    category,
    rarity,
    set,
    sprite,
    footprint: { w, h },
    surface,
  }),
);

const BY_KEY = new Map(CATALOGUE.map((c) => [c.key, c]));

/** The catalogue entry for a key (undefined for a key no longer in the catalogue). */
export const collectible = (key: string) => BY_KEY.get(key);

/** The sprite's URL in the web app. */
export const spriteUrl = (c: Pick<Collectible, 'sprite'>, dir: Direction = 'SE') =>
  `/assets/collectibles/${c.sprite}_${dir}.png`;
