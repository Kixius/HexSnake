import type { GameSnapshot } from './snapshot';
import { type MutationDef, RARITY_WEIGHT, UPGRADES } from './registry';

export interface ActiveMutation {
  def: MutationDef;
  stacks: number;
}

/**
 * Owns the mutation lifecycle: rolls 3 weighted-distinct choices for the
 * upgrade screen, applies picks to the shared GameSnapshot, and tracks the
 * active build for the HUD. Maxed-out upgrades stop appearing in rolls.
 */
export class UpgradeSystem {
  private readonly registry: readonly MutationDef[] = UPGRADES;
  readonly active: ActiveMutation[] = [];

  /** 3 weighted-distinct choices, excluding maxed-out upgrades. */
  rollThree(): MutationDef[] {
    const candidates = this.registry.filter((d) => !this.isMaxed(d));
    // Exponential race: key = -ln(rand) / weight. Higher weight -> smaller key -> picked.
    const keyed = candidates.map((d) => ({
      d,
      k: -Math.log(Math.random()) / RARITY_WEIGHT[d.rarity],
    }));
    keyed.sort((a, b) => a.k - b.k);
    return keyed.slice(0, 3).map((x) => x.d);
  }

  isMaxed(def: MutationDef): boolean {
    const entry = this.active.find((a) => a.def.id === def.id);
    return entry ? entry.stacks >= def.maxStacks : false;
  }

  apply(id: string, snap: GameSnapshot): void {
    const def = this.registry.find((d) => d.id === id);
    if (!def) return;
    let entry = this.active.find((a) => a.def.id === id);
    if (!entry) {
      entry = { def, stacks: 0 };
      this.active.push(entry);
    }
    if (entry.stacks >= def.maxStacks) return;
    entry.stacks++;
    def.apply(snap, entry.stacks);
  }

  reset(): void {
    this.active.length = 0;
  }

  /**
   * Apex Predator resets the score multiplier to 1. Routed through UpgradeSystem
   * so it remains the sole writer of GameSnapshot (see CLAUDE.md seam rule).
   */
  resetMultiplier(snap: GameSnapshot): void {
    snap.scoreMult = 1;
  }

  /** Summary entries for the death screen. */
  buildSummary(): { name: string; stacks: number }[] {
    return this.active.map((a) => ({ name: a.def.name, stacks: a.stacks }));
  }
}
