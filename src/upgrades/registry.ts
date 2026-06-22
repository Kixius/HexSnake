import { PALETTE } from '../config';
import type { GameSnapshot } from './snapshot';

export type Rarity = 'common' | 'rare' | 'epic';

export interface MutationDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  /** Maximum times this can be taken. Infinity = unlimited. */
  maxStacks: number;
  /** Mutates the shared GameSnapshot. `stacks` is the count AFTER this pick. */
  apply: (snap: GameSnapshot, stacks: number) => void;
}

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1,
  rare: 0.45,
  epic: 0.18,
};

export function rarityColor(r: Rarity): string {
  switch (r) {
    case 'common':
      return PALETTE.teal;
    case 'rare':
      return PALETTE.gold;
    case 'epic':
      return PALETTE.orange;
  }
}

const SCORE_MULT_CAP = 5;

export const UPGRADES: readonly MutationDef[] = [
  {
    id: 'thick_scales',
    name: 'Thick Scales',
    description: '+1 max health (tanks toxic slime) and soak one wall/bounds hit per floor.',
    rarity: 'common',
    maxStacks: 3,
    apply: (snap) => {
      snap.maxHealth += 1;
      snap.wallCharges += 1;
    },
  },
  {
    id: 'acid_trail',
    name: 'Acid Trail',
    description: 'Your tail dissolves over time — stay nimble on long, cluttered runs.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (snap) => {
      snap.meltEnabled = true;
    },
  },
  {
    id: 'phase_shifter',
    name: 'Phase Shifter',
    description: '[SPACE] Phase through your own body for 3s. 9s cooldown.',
    rarity: 'epic',
    maxStacks: 1,
    apply: (snap) => {
      snap.phaseEnabled = true;
    },
  },
  {
    id: 'split_tongue',
    name: 'Split Tongue',
    description: '+3 sense radius — rare Chamber Cores glow from further away.',
    rarity: 'common',
    maxStacks: 3,
    apply: (snap) => {
      snap.radarRadius += 3;
    },
  },
  {
    id: 'growth_hormone',
    name: 'Growth Hormone',
    description: '+2 length per essence and +0.25 score multiplier (capped 5x).',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (snap) => {
      snap.growthPerFood += 2;
      snap.scoreMult = Math.min(SCORE_MULT_CAP, snap.scoreMult + 0.25);
    },
  },
  {
    id: 'greedy_metabolism',
    name: 'Greedy Metabolism',
    description: '+0.4 score multiplier (capped 5x). No extra growth — pure scoring.',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (snap) => {
      snap.scoreMult = Math.min(SCORE_MULT_CAP, snap.scoreMult + 0.4);
    },
  },
];
