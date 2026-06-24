import { PALETTE } from '../config';
import type { GameSnapshot } from './snapshot';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface MutationDef {
  id: string;
  name: string;
  /** Mechanic description shown on the card body. */
  description: string;
  /** Optional italic flavor line shown under the name. */
  flavor?: string;
  rarity: Rarity;
  /** Maximum times this can be taken. Infinity = unlimited. */
  maxStacks: number;
  /** Mutates the shared GameSnapshot. `stacks` is the count AFTER this pick. */
  apply: (snap: GameSnapshot, stacks: number) => void;
}

/**
 * Exponential-race weights. The marginal chance an offered card is a given rarity
 * ≈ weight / sum(weights) ≈ common 60% / rare 27% / epic 11% / legendary 3%.
 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1,
  rare: 0.45,
  epic: 0.18,
  legendary: 0.05,
};

export function rarityColor(r: Rarity): string {
  switch (r) {
    case 'common':
      return PALETTE.teal;
    case 'rare':
      return PALETTE.gold;
    case 'epic':
      return PALETTE.orange;
    case 'legendary':
      return PALETTE.legendary;
  }
}

const SCORE_MULT_CAP = 5;

export const UPGRADES: readonly MutationDef[] = [
  // ---- COMMON (solid stat adjustments) ----
  {
    id: 'elongated_strike',
    name: 'Elongated Strike',
    description: '+25% score from essence. Drawback: the snake moves 5% faster.',
    flavor: 'Strike while the essence is hot.',
    rarity: 'common',
    maxStacks: Infinity,
    apply: (snap) => {
      snap.scoreMult = Math.min(SCORE_MULT_CAP, snap.scoreMult + 0.25);
      snap.speedMult += 0.05;
    },
  },
  {
    id: 'chitinous_shell',
    name: 'Chitinous Shell',
    description:
      '+1 Armor charge (max 2). Striking a placed wall soaks the hit, shatters that wall into open space, and prevents death.',
    flavor: 'Walls crack before you do.',
    rarity: 'common',
    maxStacks: 2,
    apply: (snap) => {
      snap.chitinousEnabled = true;
      snap.wallCharges = Math.min(snap.chitinCap, snap.wallCharges + 1);
    },
  },
  {
    id: 'nutrient_storage',
    name: 'Nutrient Storage',
    description: 'Reduces the essence needed to open each floor portal by 2.',
    flavor: 'Every drop counts. Save some for later.',
    rarity: 'common',
    maxStacks: 3,
    apply: (snap) => {
      snap.essenceReduction += 2;
    },
  },

  // ---- RARE (hex & grid manipulators) ----
  {
    id: 'tri_directional_fork',
    name: 'Tri-Directional Fork',
    description:
      'Essence spawns in clusters of 3 adjacent hexes. Eating one makes the other two vanish.',
    flavor: 'Three morsels, one meal.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (snap) => {
      snap.forkEnabled = true;
    },
  },
  {
    id: 'shedding_season',
    name: 'Shedding Season',
    description:
      'Every 15 hexes traveled, naturally shed your last tail segment — shorter, with no score lost.',
    flavor: 'Leave the old skin behind.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (snap) => {
      snap.sheddingEnabled = true;
    },
  },
  {
    id: 'diagonal_slip',
    name: 'Diagonal Slip',
    description:
      '[SHIFT] 2s window, 15s cooldown: skim along a placed wall instead of crashing into it.',
    flavor: 'Grease along the grain.',
    rarity: 'rare',
    maxStacks: 1,
    apply: (snap) => {
      snap.slipEnabled = true;
    },
  },

  // ---- EPIC (active abilities & major modifiers) ----
  {
    id: 'phase_shifter',
    name: 'Phase Shifter',
    description: '[SPACE] Phase through your own body for 4s. 8s cooldown.',
    flavor: 'Exist halfway between hexes.',
    rarity: 'epic',
    maxStacks: 1,
    apply: (snap) => {
      snap.phaseEnabled = true;
    },
  },
  {
    id: 'acidic_trail',
    name: 'Acidic Trail',
    description:
      'Your last 3 tail segments drip acid. Moving hazards that cross it are dissolved.',
    flavor: 'Your wake dissolves the unwary.',
    rarity: 'epic',
    maxStacks: 1,
    apply: (snap) => {
      snap.acidicEnabled = true;
    },
  },
  {
    id: 'hypertrophy',
    name: 'Hypertrophy',
    description:
      '+200% score multiplier, but you grow 2 segments per essence instead of 1.',
    flavor: 'Mass is its own kind of armor.',
    rarity: 'epic',
    maxStacks: 1,
    apply: (snap) => {
      snap.scoreMult = Math.min(SCORE_MULT_CAP, snap.scoreMult + 2);
      snap.growthPerFood += 1;
    },
  },

  // ---- LEGENDARY (run-defining) ----
  {
    id: 'ouroboros_loop',
    name: 'Ouroboros Loop',
    description:
      'Encircle hazards and bite your own tail to close the loop: everything trapped inside is vaporized into bonus score. You survive.',
    flavor: 'The serpent that swallows the world.',
    rarity: 'legendary',
    maxStacks: 1,
    apply: (snap) => {
      snap.ouroborosEnabled = true;
    },
  },
  {
    id: 'hydra_venom',
    name: "Hydra's Venom",
    description:
      'One-time per run: crashing into a hazard severs your front half — control swaps to the tail half, now moving in reverse. (1 use)',
    flavor: 'Cut one head, another remains.',
    rarity: 'legendary',
    maxStacks: 1,
    apply: (snap) => {
      snap.hydraEnabled = true;
    },
  },
  {
    id: 'apex_predator',
    name: 'Apex Predator',
    description:
      'You never die to your own tail. Biting it devours those segments (shortening you) and resets your score multiplier.',
    flavor: 'At the top, you eat yourself alive.',
    rarity: 'legendary',
    maxStacks: 1,
    apply: (snap) => {
      snap.apexEnabled = true;
    },
  },
];
