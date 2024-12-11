import Pokemon, { EnemyPokemon, HitResult, MoveResult, PlayerPokemon, PokemonMove } from "../field/pokemon";
import { Type } from "#enums/type";
import { Constructor } from "#app/utils";
import * as Utils from "../utils";
import { getPokemonNameWithAffix } from "../messages";
import { Weather } from "#app/data/weather";
import { BattlerTag, BattlerTagLapseType, GroundedTag } from "./battler-tags";
import { getNonVolatileStatusEffects, getStatusEffectDescriptor, getStatusEffectHealText } from "#app/data/status-effect";
import { Gender } from "./gender";
import Move, { AttackMove, MoveCategory, MoveFlags, MoveTarget, FlinchAttr, OneHitKOAttr, HitHealAttr, allMoves, StatusMove, SelfStatusMove, VariablePowerAttr, applyMoveAttrs, VariableMoveTypeAttr, RandomMovesetMoveAttr, RandomMoveAttr, NaturePowerAttr, CopyMoveAttr, NeutralDamageAgainstFlyingTypeMultiplierAttr, FixedDamageAttr } from "./move";
import { ArenaTagSide, ArenaTrapTag } from "./arena-tag";
import { BerryModifier, HitHealModifier, PokemonHeldItemModifier } from "../modifier/modifier";
import { TerrainType } from "./terrain";
import { SpeciesFormChangeManualTrigger, SpeciesFormChangeRevertWeatherFormTrigger, SpeciesFormChangeWeatherTrigger } from "./pokemon-forms";
import i18next from "i18next";
import { Localizable } from "#app/interfaces/locales";
import { Command } from "../ui/command-ui-handler";
import { BerryModifierType } from "#app/modifier/modifier-type";
import { getPokeballName } from "./pokeball";
import { BattlerIndex, BattleType } from "#app/battle";
import { Abilities } from "#enums/abilities";
import { ArenaTagType } from "#enums/arena-tag-type";
import { BattlerTagType } from "#enums/battler-tag-type";
import { Moves } from "#enums/moves";
import { Species } from "#enums/species";
import { Stat, type BattleStat, type EffectiveStat, BATTLE_STATS, EFFECTIVE_STATS, getStatKey } from "#app/enums/stat";
import { MovePhase } from "#app/phases/move-phase";
import { PokemonHealPhase } from "#app/phases/pokemon-heal-phase";
import { ShowAbilityPhase } from "#app/phases/show-ability-phase";
import { StatStageChangePhase } from "#app/phases/stat-stage-change-phase";
import BattleScene from "#app/battle-scene";
import { SwitchType } from "#app/enums/switch-type";
import { SwitchPhase } from "#app/phases/switch-phase";
import { SwitchSummonPhase } from "#app/phases/switch-summon-phase";
import { BattleEndPhase } from "#app/phases/battle-end-phase";
import { NewBattlePhase } from "#app/phases/new-battle-phase";
import { MoveEndPhase } from "#app/phases/move-end-phase";
import { PokemonAnimType } from "#enums/pokemon-anim-type";
import { StatusEffect } from "#enums/status-effect";
import { WeatherType } from "#enums/weather-type";

export class Ability implements Localizable {
  public id: Abilities;

  private nameAppend: string;
  public name: string;
  public description: string;
  public generation: integer;
  public isBypassFaint: boolean;
  public isIgnorable: boolean;
  public attrs: AbAttr[];
  public conditions: AbAttrCondition[];

  constructor(id: Abilities, generation: integer) {
    this.id = id;

    this.nameAppend = "";
    this.generation = generation;
    this.attrs = [];
    this.conditions = [];

    this.localize();
  }

  localize(): void {
    const i18nKey = Abilities[this.id].split("_").filter(f => f).map((f, i) => i ? `${f[0]}${f.slice(1).toLowerCase()}` : f.toLowerCase()).join("") as string;

    this.name = this.id ? `${i18next.t(`ability:${i18nKey}.name`) as string}${this.nameAppend}` : "";
    this.description = this.id ? i18next.t(`ability:${i18nKey}.description`) as string : "";
  }

  /**
   * Get all ability attributes that match `attrType`
   * @param attrType any attribute that extends {@linkcode AbAttr}
   * @returns Array of attributes that match `attrType`, Empty Array if none match.
   */
  getAttrs<T extends AbAttr>(attrType: Constructor<T> ): T[] {
    return this.attrs.filter((a): a is T => a instanceof attrType);
  }

  /**
   * Check if an ability has an attribute that matches `attrType`
   * @param attrType any attribute that extends {@linkcode AbAttr}
   * @returns true if the ability has attribute `attrType`
   */
  hasAttr<T extends AbAttr>(attrType: Constructor<T>): boolean {
    return this.attrs.some((attr) => attr instanceof attrType);
  }

  attr<T extends Constructor<AbAttr>>(AttrType: T, ...args: ConstructorParameters<T>): Ability {
    const attr = new AttrType(...args);
    this.attrs.push(attr);

    return this;
  }

  conditionalAttr<T extends Constructor<AbAttr>>(condition: AbAttrCondition, AttrType: T, ...args: ConstructorParameters<T>): Ability {
    const attr = new AttrType(...args);
    attr.addCondition(condition);
    this.attrs.push(attr);

    return this;
  }

  bypassFaint(): Ability {
    this.isBypassFaint = true;
    return this;
  }

  ignorable(): Ability {
    this.isIgnorable = true;
    return this;
  }

  condition(condition: AbAttrCondition): Ability {
    this.conditions.push(condition);

    return this;
  }

  partial(): this {
    this.nameAppend += " (P)";
    return this;
  }

  unimplemented(): this {
    this.nameAppend += " (N)";
    return this;
  }

  /**
   * Internal flag used for developers to document edge cases. When using this, please be sure to document the edge case.
   * @returns the ability
   */
  edgeCase(): this {
    return this;
  }
}

type AbAttrApplyFunc<TAttr extends AbAttr> = (attr: TAttr, passive: boolean) => boolean | Promise<boolean>;
type AbAttrCondition = (pokemon: Pokemon) => boolean;

// TODO: Can this be improved?
type PokemonAttackCondition = (user: Pokemon | null, target: Pokemon | null, move: Move) => boolean;
type PokemonDefendCondition = (target: Pokemon, user: Pokemon, move: Move) => boolean;
type PokemonStatStageChangeCondition = (target: Pokemon, statsChanged: BattleStat[], stages: number) => boolean;

export abstract class AbAttr {
  public showAbility: boolean;
  private extraCondition: AbAttrCondition;

  constructor(showAbility: boolean = true) {
    this.showAbility = showAbility;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder | null, args: any[]): boolean | Promise<boolean> {
    return false;
  }

  getTriggerMessage(_pokemon: Pokemon, _abilityName: string, ..._args: any[]): string | null {
    return null;
  }

  getCondition(): AbAttrCondition | null {
    return this.extraCondition || null;
  }

  addCondition(condition: AbAttrCondition): AbAttr {
    this.extraCondition = condition;
    return this;
  }
}

export class BlockRecoilDamageAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;

    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]) {
    return i18next.t("abilityTriggers:blockRecoilDamage", { pokemonName: getPokemonNameWithAffix(pokemon), abilityName: abilityName });
  }
}

/**
 * Attribute for abilities that increase the chance of a double battle
 * occurring.
 * @see apply
 */
export class DoubleBattleChanceAbAttr extends AbAttr {
  constructor() {
    super(false);
  }

  /**
   * Increases the chance of a double battle occurring
   * @param args [0] {@linkcode Utils.NumberHolder} for double battle chance
   * @returns true if the ability was applied
   */
  apply(_pokemon: Pokemon, _passive: boolean, _simulated: boolean, _cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const doubleBattleChance = args[0] as Utils.NumberHolder;
    // This is divided because the chance is generated as a number from 0 to doubleBattleChance.value using Utils.randSeedInt
    // A double battle will initiate if the generated number is 0
    doubleBattleChance.value = doubleBattleChance.value / 4;

    return true;
  }
}

export class PostBattleInitAbAttr extends AbAttr {
  applyPostBattleInit(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class PostBattleInitFormChangeAbAttr extends PostBattleInitAbAttr {
  private formFunc: (p: Pokemon) => integer;

  constructor(formFunc: ((p: Pokemon) => integer)) {
    super(true);

    this.formFunc = formFunc;
  }

  applyPostBattleInit(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const formIndex = this.formFunc(pokemon);
    if (formIndex !== pokemon.formIndex && !simulated) {
      return pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger, false);
    }

    return false;
  }
}

export class PostBattleInitStatStageChangeAbAttr extends PostBattleInitAbAttr {
  private stats: BattleStat[];
  private stages: number;
  private selfTarget: boolean;

  constructor(stats: BattleStat[], stages: number, selfTarget?: boolean) {
    super();

    this.stats = stats;
    this.stages = stages;
    this.selfTarget = !!selfTarget;
  }

  applyPostBattleInit(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const statStageChangePhases: StatStageChangePhase[] = [];

    if (!simulated) {
      if (this.selfTarget) {
        statStageChangePhases.push(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, this.stats, this.stages));
      } else {
        for (const opponent of pokemon.getOpponents()) {
          statStageChangePhases.push(new StatStageChangePhase(pokemon.scene, opponent.getBattlerIndex(), false, this.stats, this.stages));
        }
      }

      for (const statStageChangePhase of statStageChangePhases) {
        if (!this.selfTarget && !statStageChangePhase.getPokemon()?.summonData) {
          pokemon.scene.pushPhase(statStageChangePhase);
        } else { // TODO: This causes the ability bar to be shown at the wrong time
          pokemon.scene.unshiftPhase(statStageChangePhase);
        }
      }
    }

    return true;
  }
}

type PreDefendAbAttrCondition = (pokemon: Pokemon, attacker: Pokemon, move: Move) => boolean;

export class PreDefendAbAttr extends AbAttr {
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move | null, cancelled: Utils.BooleanHolder | null, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class PreDefendFullHpEndureAbAttr extends PreDefendAbAttr {
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (pokemon.isFullHp()
        && pokemon.getMaxHp() > 1 //Checks if pokemon has wonder_guard (which forces 1hp)
        && (args[0] as Utils.NumberHolder).value >= pokemon.hp) { //Damage >= hp
      return simulated || pokemon.addTag(BattlerTagType.STURDY, 1);
    }

    return false;
  }
}

export class BlockItemTheftAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;

    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]) {
    return i18next.t("abilityTriggers:blockItemTheft", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName
    });
  }
}

export class StabBoostAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if ((args[0] as Utils.NumberHolder).value > 1) {
      (args[0] as Utils.NumberHolder).value += 0.5;
      return true;
    }

    return false;
  }
}

export class ReceivedMoveDamageMultiplierAbAttr extends PreDefendAbAttr {
  protected condition: PokemonDefendCondition;
  private damageMultiplier: number;

  constructor(condition: PokemonDefendCondition, damageMultiplier: number) {
    super();

    this.condition = condition;
    this.damageMultiplier = damageMultiplier;
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.condition(pokemon, attacker, move)) {
      (args[0] as Utils.NumberHolder).value = Utils.toDmgValue((args[0] as Utils.NumberHolder).value * this.damageMultiplier);

      return true;
    }

    return false;
  }
}

/**
 * Reduces the damage dealt to an allied Pokemon. Used by Friend Guard.
 * @see {@linkcode applyPreDefend}
 */
export class AlliedFieldDamageReductionAbAttr extends PreDefendAbAttr {
  private damageMultiplier: number;

  constructor(damageMultiplier: number) {
    super();
    this.damageMultiplier = damageMultiplier;
  }

  /**
   * Handles the damage reduction
   * @param args
   * - `[0]` {@linkcode Utils.NumberHolder} - The damage being dealt
   */
  override applyPreDefend(_pokemon: Pokemon, _passive: boolean, _simulated: boolean, _attacker: Pokemon, _move: Move, _cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const damage = args[0] as Utils.NumberHolder;
    damage.value = Utils.toDmgValue(damage.value * this.damageMultiplier);
    return true;
  }
}

export class ReceivedTypeDamageMultiplierAbAttr extends ReceivedMoveDamageMultiplierAbAttr {
  constructor(moveType: Type, damageMultiplier: number) {
    super((target, user, move) => user.getMoveType(move) === moveType, damageMultiplier);
  }
}

/**
 * Determines whether a Pokemon is immune to a move because of an ability.
 * @extends PreDefendAbAttr
 * @see {@linkcode applyPreDefend}
 * @see {@linkcode getCondition}
 */
export class TypeImmunityAbAttr extends PreDefendAbAttr {
  private immuneType: Type | null;
  private condition: AbAttrCondition | null;

  constructor(immuneType: Type | null, condition?: AbAttrCondition) {
    super();

    this.immuneType = immuneType;
    this.condition = condition ?? null;
  }

  /**
   * Applies immunity if this ability grants immunity to the type of the given move.
   * @param pokemon {@linkcode Pokemon} The defending Pokemon.
   * @param passive - Whether the ability is passive.
   * @param attacker {@linkcode Pokemon} The attacking Pokemon.
   * @param move {@linkcode Move} The attacking move.
   * @param cancelled {@linkcode Utils.BooleanHolder} - A holder for a boolean value indicating if the move was cancelled.
   * @param args [0] {@linkcode Utils.NumberHolder} gets set to 0 if move is immuned by an ability.
   * @param args [1] - Whether the move is simulated.
   */
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    // Field moves should ignore immunity
    if ([ MoveTarget.BOTH_SIDES, MoveTarget.ENEMY_SIDE, MoveTarget.USER_SIDE ].includes(move.moveTarget)) {
      return false;
    }
    if (attacker !== pokemon && attacker.getMoveType(move) === this.immuneType) {
      (args[0] as Utils.NumberHolder).value = 0;
      return true;
    }
    return false;
  }

  getImmuneType(): Type | null {
    return this.immuneType;
  }

  override getCondition(): AbAttrCondition | null {
    return this.condition;
  }
}

export class AttackTypeImmunityAbAttr extends TypeImmunityAbAttr {
  constructor(immuneType: Type, condition?: AbAttrCondition) {
    super(immuneType, condition);
  }

  /**
   * Applies immunity if the move used is not a status move.
   * Type immunity abilities that do not give additional benefits (HP recovery, stat boosts, etc) are not immune to status moves of the type
   * Example: Levitate
   */
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    // this is a hacky way to fix the Levitate/Thousand Arrows interaction, but it works for now...
    if (move.category !== MoveCategory.STATUS && !move.hasAttr(NeutralDamageAgainstFlyingTypeMultiplierAttr)) {
      return super.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args);
    }
    return false;
  }
}

export class TypeImmunityHealAbAttr extends TypeImmunityAbAttr {
  constructor(immuneType: Type) {
    super(immuneType);
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const ret = super.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args);

    if (ret) {
      if (!pokemon.isFullHp() && !simulated) {
        const abilityName = (!passive ? pokemon.getAbility() : pokemon.getPassiveAbility()).name;
        pokemon.scene.unshiftPhase(new PokemonHealPhase(pokemon.scene, pokemon.getBattlerIndex(),
          Utils.toDmgValue(pokemon.getMaxHp() / 4), i18next.t("abilityTriggers:typeImmunityHeal", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName }), true));
        cancelled.value = true; // Suppresses "No Effect" message
      }
      return true;
    }

    return false;
  }
}

class TypeImmunityStatStageChangeAbAttr extends TypeImmunityAbAttr {
  private stat: BattleStat;
  private stages: number;

  constructor(immuneType: Type, stat: BattleStat, stages: number, condition?: AbAttrCondition) {
    super(immuneType, condition);

    this.stat = stat;
    this.stages = stages;
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const ret = super.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args);

    if (ret) {
      cancelled.value = true; // Suppresses "No Effect" message
      if (!simulated) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ this.stat ], this.stages));
      }
    }

    return ret;
  }
}

class TypeImmunityAddBattlerTagAbAttr extends TypeImmunityAbAttr {
  private tagType: BattlerTagType;
  private turnCount: integer;

  constructor(immuneType: Type, tagType: BattlerTagType, turnCount: integer, condition?: AbAttrCondition) {
    super(immuneType, condition);

    this.tagType = tagType;
    this.turnCount = turnCount;
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const ret = super.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args);

    if (ret) {
      cancelled.value = true; // Suppresses "No Effect" message
      if (!simulated) {
        pokemon.addTag(this.tagType, this.turnCount, undefined, pokemon.id);
      }
    }

    return ret;
  }
}

export class NonSuperEffectiveImmunityAbAttr extends TypeImmunityAbAttr {
  constructor(condition?: AbAttrCondition) {
    super(null, condition);
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const modifierValue = args.length > 0
      ? (args[0] as Utils.NumberHolder).value
      : pokemon.getAttackTypeEffectiveness(attacker.getMoveType(move), attacker, undefined, undefined, move);

    if (move instanceof AttackMove && modifierValue < 2) {
      cancelled.value = true; // Suppresses "No Effect" message
      (args[0] as Utils.NumberHolder).value = 0;
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:nonSuperEffectiveImmunity", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName
    });
  }
}

/**
 * Attribute implementing the effects of {@link https://bulbapedia.bulbagarden.net/wiki/Tera_Shell_(Ability) | Tera Shell}
 * When the source is at full HP, incoming attacks will have a maximum 0.5x type effectiveness multiplier.
 * @extends PreDefendAbAttr
 */
export class FullHpResistTypeAbAttr extends PreDefendAbAttr {
  /**
   * Reduces a type multiplier to 0.5 if the source is at full HP.
   * @param pokemon {@linkcode Pokemon} the Pokemon with this ability
   * @param passive n/a
   * @param simulated n/a (this doesn't change game state)
   * @param attacker n/a
   * @param move {@linkcode Move} the move being used on the source
   * @param cancelled n/a
   * @param args `[0]` a container for the move's current type effectiveness multiplier
   * @returns `true` if the move's effectiveness is reduced; `false` otherwise
   */
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move | null, cancelled: Utils.BooleanHolder | null, args: any[]): boolean | Promise<boolean> {
    const typeMultiplier = args[0];
    if (!(typeMultiplier && typeMultiplier instanceof Utils.NumberHolder)) {
      return false;
    }

    if (move && move.hasAttr(FixedDamageAttr)) {
      return false;
    }

    if (pokemon.isFullHp() && typeMultiplier.value > 0.5) {
      typeMultiplier.value = 0.5;
      pokemon.turnData.moveEffectiveness = 0.5;
      return true;
    }
    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:fullHpResistType", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon)
    });
  }
}

export class PostDefendAbAttr extends AbAttr {
  applyPostDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult | null, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class FieldPriorityMoveImmunityAbAttr extends PreDefendAbAttr {
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (move.moveTarget === MoveTarget.USER || move.moveTarget === MoveTarget.NEAR_ALLY) {
      return false;
    }

    if (move.getPriority(attacker) > 0 && !move.isMultiTarget()) {
      cancelled.value = true;
      return true;
    }

    return false;
  }
}

export class PostStatStageChangeAbAttr extends AbAttr {
  applyPostStatStageChange(pokemon: Pokemon, simulated: boolean, statsChanged: BattleStat[], stagesChanged: integer, selfTarget: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class MoveImmunityAbAttr extends PreDefendAbAttr {
  private immuneCondition: PreDefendAbAttrCondition;

  constructor(immuneCondition: PreDefendAbAttrCondition) {
    super(true);

    this.immuneCondition = immuneCondition;
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.immuneCondition(pokemon, attacker, move)) {
      cancelled.value = true;
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:moveImmunity", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) });
  }
}

/**
 * Reduces the accuracy of status moves used against the Pokémon with this ability to 50%.
 * Used by Wonder Skin.
 *
 * @extends PreDefendAbAttr
 */
export class WonderSkinAbAttr extends PreDefendAbAttr {
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const moveAccuracy = args[0] as Utils.NumberHolder;
    if (move.category === MoveCategory.STATUS && moveAccuracy.value >= 50) {
      moveAccuracy.value = 50;
      return true;
    }

    return false;
  }
}

export class MoveImmunityStatStageChangeAbAttr extends MoveImmunityAbAttr {
  private stat: BattleStat;
  private stages: number;

  constructor(immuneCondition: PreDefendAbAttrCondition, stat: BattleStat, stages: number) {
    super(immuneCondition);
    this.stat = stat;
    this.stages = stages;
  }

  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const ret = super.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args);
    if (ret && !simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ this.stat ], this.stages));
    }

    return ret;
  }
}
/**
 * Class for abilities that make drain moves deal damage to user instead of healing them.
 * @extends PostDefendAbAttr
 * @see {@linkcode applyPostDefend}
 */
export class ReverseDrainAbAttr extends PostDefendAbAttr {
  /**
   * Determines if a damage and draining move was used to check if this ability should stop the healing.
   * Examples include: Absorb, Draining Kiss, Bitter Blade, etc.
   * Also displays a message to show this ability was activated.
   * @param pokemon {@linkcode Pokemon} with this ability
   * @param _passive N/A
   * @param attacker {@linkcode Pokemon} that is attacking this Pokemon
   * @param move {@linkcode PokemonMove} that is being used
   * @param _hitResult N/A
   * @param _args N/A
   * @returns true if healing should be reversed on a healing move, false otherwise.
   */
  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.hasAttr(HitHealAttr) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!simulated) {
        pokemon.scene.queueMessage(i18next.t("abilityTriggers:reverseDrain", { pokemonNameWithAffix: getPokemonNameWithAffix(attacker) }));
      }
      return true;
    }
    return false;
  }
}

export class PostDefendStatStageChangeAbAttr extends PostDefendAbAttr {
  private condition: PokemonDefendCondition;
  private stat: BattleStat;
  private stages: number;
  private selfTarget: boolean;
  private allOthers: boolean;

  constructor(condition: PokemonDefendCondition, stat: BattleStat, stages: number, selfTarget: boolean = true, allOthers: boolean = false) {
    super(true);

    this.condition = condition;
    this.stat = stat;
    this.stages = stages;
    this.selfTarget = selfTarget;
    this.allOthers = allOthers;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (this.condition(pokemon, attacker, move) && !move.hitsSubstitute(attacker, pokemon)) {
      if (simulated) {
        return true;
      }

      if (this.allOthers) {
        const otherPokemon = pokemon.getAlly() ? pokemon.getOpponents().concat([ pokemon.getAlly() ]) : pokemon.getOpponents();
        for (const other of otherPokemon) {
          other.scene.unshiftPhase(new StatStageChangePhase(other.scene, (other).getBattlerIndex(), false, [ this.stat ], this.stages));
        }
        return true;
      }
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, (this.selfTarget ? pokemon : attacker).getBattlerIndex(), this.selfTarget, [ this.stat ], this.stages));
      return true;
    }

    return false;
  }
}

export class PostDefendHpGatedStatStageChangeAbAttr extends PostDefendAbAttr {
  private condition: PokemonDefendCondition;
  private hpGate: number;
  private stats: BattleStat[];
  private stages: number;
  private selfTarget: boolean;

  constructor(condition: PokemonDefendCondition, hpGate: number, stats: BattleStat[], stages: number, selfTarget: boolean = true) {
    super(true);

    this.condition = condition;
    this.hpGate = hpGate;
    this.stats = stats;
    this.stages = stages;
    this.selfTarget = selfTarget;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    const hpGateFlat: number = Math.ceil(pokemon.getMaxHp() * this.hpGate);
    const lastAttackReceived = pokemon.turnData.attacksReceived[pokemon.turnData.attacksReceived.length - 1];
    const damageReceived = lastAttackReceived?.damage || 0;

    if (this.condition(pokemon, attacker, move) && (pokemon.hp <= hpGateFlat && (pokemon.hp + damageReceived) > hpGateFlat) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!simulated) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, (this.selfTarget ? pokemon : attacker).getBattlerIndex(), true, this.stats, this.stages));
      }
      return true;
    }

    return false;
  }
}

export class PostDefendApplyArenaTrapTagAbAttr extends PostDefendAbAttr {
  private condition: PokemonDefendCondition;
  private tagType: ArenaTagType;

  constructor(condition: PokemonDefendCondition, tagType: ArenaTagType) {
    super(true);

    this.condition = condition;
    this.tagType = tagType;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (this.condition(pokemon, attacker, move) && !move.hitsSubstitute(attacker, pokemon)) {
      const tag = pokemon.scene.arena.getTag(this.tagType) as ArenaTrapTag;
      if (!pokemon.scene.arena.getTag(this.tagType) || tag.layers < tag.maxLayers) {
        if (!simulated) {
          pokemon.scene.arena.addTag(this.tagType, 0, undefined, pokemon.id, pokemon.isPlayer() ? ArenaTagSide.ENEMY : ArenaTagSide.PLAYER);
        }
        return true;
      }
    }
    return false;
  }
}

export class PostDefendApplyBattlerTagAbAttr extends PostDefendAbAttr {
  private condition: PokemonDefendCondition;
  private tagType: BattlerTagType;
  constructor(condition: PokemonDefendCondition, tagType: BattlerTagType) {
    super(true);

    this.condition = condition;
    this.tagType = tagType;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (this.condition(pokemon, attacker, move) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!pokemon.getTag(this.tagType) && !simulated) {
        pokemon.addTag(this.tagType, undefined, undefined, pokemon.id);
        pokemon.scene.queueMessage(i18next.t("abilityTriggers:windPowerCharged", { pokemonName: getPokemonNameWithAffix(pokemon), moveName: move.name }));
      }
      return true;
    }
    return false;
  }
}

export class PostDefendTypeChangeAbAttr extends PostDefendAbAttr {
  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, _args: any[]): boolean {
    if (hitResult < HitResult.NO_EFFECT && !move.hitsSubstitute(attacker, pokemon)) {
      if (simulated) {
        return true;
      }
      const type = attacker.getMoveType(move);
      const pokemonTypes = pokemon.getTypes(true);
      if (pokemonTypes.length !== 1 || pokemonTypes[0] !== type) {
        pokemon.summonData.types = [ type ];
        return true;
      }
    }

    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:postDefendTypeChange", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName,
      typeName: i18next.t(`pokemonInfo:Type.${Type[pokemon.getTypes(true)[0]]}`)
    });
  }
}

export class PostDefendTerrainChangeAbAttr extends PostDefendAbAttr {
  private terrainType: TerrainType;

  constructor(terrainType: TerrainType) {
    super();

    this.terrainType = terrainType;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, _args: any[]): boolean {
    if (hitResult < HitResult.NO_EFFECT && !move.hitsSubstitute(attacker, pokemon)) {
      if (simulated) {
        return pokemon.scene.arena.terrain?.terrainType !== (this.terrainType || undefined);
      } else {
        return pokemon.scene.arena.trySetTerrain(this.terrainType, true);
      }
    }

    return false;
  }
}

export class PostDefendContactApplyStatusEffectAbAttr extends PostDefendAbAttr {
  public chance: integer;
  private effects: StatusEffect[];

  constructor(chance: integer, ...effects: StatusEffect[]) {
    super();

    this.chance = chance;
    this.effects = effects;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon) && !attacker.status
      && (this.chance === -1 || pokemon.randSeedInt(100) < this.chance) && !move.hitsSubstitute(attacker, pokemon)) {
      const effect = this.effects.length === 1 ? this.effects[0] : this.effects[pokemon.randSeedInt(this.effects.length)];
      if (simulated) {
        return attacker.canSetStatus(effect, true, false, pokemon);
      } else {
        return attacker.trySetStatus(effect, true, pokemon);
      }
    }

    return false;
  }
}

export class EffectSporeAbAttr extends PostDefendContactApplyStatusEffectAbAttr {
  constructor() {
    super(10, StatusEffect.POISON, StatusEffect.PARALYSIS, StatusEffect.SLEEP);
  }

  applyPostDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, args: any[]): boolean {
    if (attacker.hasAbility(Abilities.OVERCOAT) || attacker.isOfType(Type.GRASS)) {
      return false;
    }
    return super.applyPostDefend(pokemon, passive, simulated, attacker, move, hitResult, args);
  }
}

export class PostDefendContactApplyTagChanceAbAttr extends PostDefendAbAttr {
  private chance: integer;
  private tagType: BattlerTagType;
  private turnCount: integer | undefined;

  constructor(chance: integer, tagType: BattlerTagType, turnCount?: integer) {
    super();

    this.tagType = tagType;
    this.chance = chance;
    this.turnCount = turnCount;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon) && pokemon.randSeedInt(100) < this.chance && !move.hitsSubstitute(attacker, pokemon)) {
      if (simulated) {
        return attacker.canAddTag(this.tagType);
      } else {
        return attacker.addTag(this.tagType, this.turnCount, move.id, attacker.id);
      }
    }

    return false;
  }
}

export class PostDefendCritStatStageChangeAbAttr extends PostDefendAbAttr {
  private stat: BattleStat;
  private stages: number;

  constructor(stat: BattleStat, stages: number) {
    super();

    this.stat = stat;
    this.stages = stages;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.hitsSubstitute(attacker, pokemon)) {
      return false;
    }

    if (!simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ this.stat ], this.stages));
    }

    return true;
  }

  override getCondition(): AbAttrCondition {
    return (pokemon: Pokemon) => pokemon.turnData.attacksReceived.length !== 0 && pokemon.turnData.attacksReceived[pokemon.turnData.attacksReceived.length - 1].critical;
  }
}

export class PostDefendContactDamageAbAttr extends PostDefendAbAttr {
  private damageRatio: integer;

  constructor(damageRatio: integer) {
    super();

    this.damageRatio = damageRatio;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (!simulated && move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon)
      && !attacker.hasAbilityWithAttr(BlockNonDirectDamageAbAttr) && !move.hitsSubstitute(attacker, pokemon)) {
      attacker.damageAndUpdate(Utils.toDmgValue(attacker.getMaxHp() * (1 / this.damageRatio)), HitResult.OTHER);
      attacker.turnData.damageTaken += Utils.toDmgValue(attacker.getMaxHp() * (1 / this.damageRatio));
      return true;
    }

    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:postDefendContactDamage", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName
    });
  }
}
/**
 * @description: This ability applies the Perish Song tag to the attacking pokemon
 * and the defending pokemon if the move makes physical contact and neither pokemon
 * already has the Perish Song tag.
 * @class PostDefendPerishSongAbAttr
 * @extends {PostDefendAbAttr}
 */
export class PostDefendPerishSongAbAttr extends PostDefendAbAttr {
  private turns: integer;

  constructor(turns: integer) {
    super();

    this.turns = turns;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon) && !move.hitsSubstitute(attacker, pokemon)) {
      if (pokemon.getTag(BattlerTagType.PERISH_SONG) || attacker.getTag(BattlerTagType.PERISH_SONG)) {
        return false;
      } else {
        if (!simulated) {
          attacker.addTag(BattlerTagType.PERISH_SONG, this.turns);
          pokemon.addTag(BattlerTagType.PERISH_SONG, this.turns);
        }
        return true;
      }
    }
    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:perishBody", { pokemonName: getPokemonNameWithAffix(pokemon), abilityName: abilityName });
  }
}

export class PostDefendWeatherChangeAbAttr extends PostDefendAbAttr {
  private weatherType: WeatherType;
  protected condition?: PokemonDefendCondition;

  constructor(weatherType: WeatherType, condition?: PokemonDefendCondition) {
    super();

    this.weatherType = weatherType;
    this.condition = condition;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (this.condition && !this.condition(pokemon, attacker, move) || move.hitsSubstitute(attacker, pokemon)) {
      return false;
    }
    if (!pokemon.scene.arena.weather?.isImmutable()) {
      if (simulated) {
        return pokemon.scene.arena.weather?.weatherType !== this.weatherType;
      }
      return pokemon.scene.arena.trySetWeather(this.weatherType, true);
    }

    return false;
  }
}

export class PostDefendAbilitySwapAbAttr extends PostDefendAbAttr {
  constructor() {
    super();
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, args: any[]): boolean {
    if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon)
      && !attacker.getAbility().hasAttr(UnswappableAbilityAbAttr) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!simulated) {
        const tempAbilityId = attacker.getAbility().id;
        attacker.summonData.ability = pokemon.getAbility().id;
        pokemon.summonData.ability = tempAbilityId;
      }
      return true;
    }

    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, _abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:postDefendAbilitySwap", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) });
  }
}

export class PostDefendAbilityGiveAbAttr extends PostDefendAbAttr {
  private ability: Abilities;

  constructor(ability: Abilities) {
    super();
    this.ability = ability;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon) && !attacker.getAbility().hasAttr(UnsuppressableAbilityAbAttr)
      && !attacker.getAbility().hasAttr(PostDefendAbilityGiveAbAttr) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!simulated) {
        attacker.summonData.ability = this.ability;
      }

      return true;
    }

    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:postDefendAbilityGive", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName
    });
  }
}

export class PostDefendMoveDisableAbAttr extends PostDefendAbAttr {
  private chance: integer;
  private attacker: Pokemon;
  private move: Move;

  constructor(chance: integer) {
    super();

    this.chance = chance;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _hitResult: HitResult, _args: any[]): boolean {
    if (attacker.getTag(BattlerTagType.DISABLED) === null && !move.hitsSubstitute(attacker, pokemon)) {
      if (move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon) && (this.chance === -1 || pokemon.randSeedInt(100) < this.chance)) {
        if (simulated) {
          return true;
        }

        this.attacker = attacker;
        this.move = move;
        this.attacker.addTag(BattlerTagType.DISABLED, 4, 0, pokemon.id);
        return true;
      }
    }
    return false;
  }
}

export class PostStatStageChangeStatStageChangeAbAttr extends PostStatStageChangeAbAttr {
  private condition: PokemonStatStageChangeCondition;
  private statsToChange: BattleStat[];
  private stages: number;

  constructor(condition: PokemonStatStageChangeCondition, statsToChange: BattleStat[], stages: number) {
    super(true);

    this.condition = condition;
    this.statsToChange = statsToChange;
    this.stages = stages;
  }

  applyPostStatStageChange(pokemon: Pokemon, simulated: boolean, statStagesChanged: BattleStat[], stagesChanged: number, selfTarget: boolean, args: any[]): boolean {
    if (this.condition(pokemon, statStagesChanged, stagesChanged) && !selfTarget) {
      if (!simulated) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, (pokemon).getBattlerIndex(), true, this.statsToChange, this.stages));
      }
      return true;
    }

    return false;
  }
}

export class PreAttackAbAttr extends AbAttr {
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon | null, move: Move, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Modifies moves additional effects with multipliers, ie. Sheer Force, Serene Grace.
 * @extends AbAttr
 * @see {@linkcode apply}
 */
export class MoveEffectChanceMultiplierAbAttr extends AbAttr {
  private chanceMultiplier: number;

  constructor(chanceMultiplier: number) {
    super(true);
    this.chanceMultiplier = chanceMultiplier;
  }
  /**
   * @param args [0]: {@linkcode Utils.NumberHolder} Move additional effect chance. Has to be higher than or equal to 0.
   *             [1]: {@linkcode Moves } Move used by the ability user.
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    // Disable showAbility during getTargetBenefitScore
    this.showAbility = args[4];

    const exceptMoves = [ Moves.ORDER_UP, Moves.ELECTRO_SHOT ];
    if ((args[0] as Utils.NumberHolder).value <= 0 || exceptMoves.includes((args[1] as Move).id)) {
      return false;
    }

    (args[0] as Utils.NumberHolder).value *= this.chanceMultiplier;
    (args[0] as Utils.NumberHolder).value = Math.min((args[0] as Utils.NumberHolder).value, 100);
    return true;

  }
}

/**
 * Sets incoming moves additional effect chance to zero, ignoring all effects from moves. ie. Shield Dust.
 * @extends PreDefendAbAttr
 * @see {@linkcode applyPreDefend}
 */
export class IgnoreMoveEffectsAbAttr extends PreDefendAbAttr {
  /**
   * @param args [0]: {@linkcode Utils.NumberHolder} Move additional effect chance.
   */
  applyPreDefend(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, cancelled: Utils.BooleanHolder, args: any[]): boolean {

    if ((args[0] as Utils.NumberHolder).value <= 0) {
      return false;
    }

    (args[0] as Utils.NumberHolder).value = 0;
    return true;

  }
}

export class VariableMovePowerAbAttr extends PreAttackAbAttr {
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    //const power = args[0] as Utils.NumberHolder;
    return false;
  }
}

export class FieldPreventExplosiveMovesAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    cancelled.value = true;
    return true;
  }
}

/**
 * Multiplies a Stat if the checked Pokemon lacks this ability.
 * If this ability cannot stack, a BooleanHolder can be used to prevent this from stacking.
 * @see {@link applyFieldStatMultiplierAbAttrs}
 * @see {@link applyFieldStat}
 * @see {@link Utils.BooleanHolder}
 */
export class FieldMultiplyStatAbAttr extends AbAttr {
  private stat: Stat;
  private multiplier: number;
  private canStack: boolean;

  constructor(stat: Stat, multiplier: number, canStack: boolean = false) {
    super(false);

    this.stat = stat;
    this.multiplier = multiplier;
    this.canStack = canStack;
  }

  /**
   * applyFieldStat: Tries to multiply a Pokemon's Stat
   * @param pokemon {@linkcode Pokemon} the Pokemon using this ability
   * @param passive {@linkcode boolean} unused
   * @param stat {@linkcode Stat} the type of the checked stat
   * @param statValue {@linkcode Utils.NumberHolder} the value of the checked stat
   * @param checkedPokemon {@linkcode Pokemon} the Pokemon this ability is targeting
   * @param hasApplied {@linkcode Utils.BooleanHolder} whether or not another multiplier has been applied to this stat
   * @param args {any[]} unused
   * @returns true if this changed the checked stat, false otherwise.
   */
  applyFieldStat(pokemon: Pokemon, passive: boolean, simulated: boolean, stat: Stat, statValue: Utils.NumberHolder, checkedPokemon: Pokemon, hasApplied: Utils.BooleanHolder, args: any[]): boolean {
    if (!this.canStack && hasApplied.value) {
      return false;
    }

    if (this.stat === stat && checkedPokemon.getAbilityAttrs(FieldMultiplyStatAbAttr).every(attr => (attr as FieldMultiplyStatAbAttr).stat !== stat)) {
      statValue.value *= this.multiplier;
      hasApplied.value = true;
      return true;
    }
    return false;
  }

}

export class MoveTypeChangeAbAttr extends PreAttackAbAttr {
  constructor(
    private newType: Type,
    private powerMultiplier: number,
    private condition?: PokemonAttackCondition
  ) {
    super(true);
  }

  // TODO: Decouple this into two attributes (type change / power boost)
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    if (this.condition && this.condition(pokemon, defender, move)) {
      if (args[0] && args[0] instanceof Utils.NumberHolder) {
        args[0].value = this.newType;
      }
      if (args[1] && args[1] instanceof Utils.NumberHolder) {
        args[1].value *= this.powerMultiplier;
      }
      return true;
    }

    return false;
  }
}

/** Ability attribute for changing a pokemon's type before using a move */
export class PokemonTypeChangeAbAttr extends PreAttackAbAttr {
  private moveType: Type;

  constructor() {
    super(true);
  }

  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    if (
      !pokemon.isTerastallized() &&
      move.id !== Moves.STRUGGLE &&
      /**
       * Skip moves that call other moves because these moves generate a following move that will trigger this ability attribute
       * @see {@link https://bulbapedia.bulbagarden.net/wiki/Category:Moves_that_call_other_moves}
       */
      !move.findAttr((attr) =>
        attr instanceof RandomMovesetMoveAttr ||
        attr instanceof RandomMoveAttr ||
        attr instanceof NaturePowerAttr ||
        attr instanceof CopyMoveAttr
      )
    ) {
      const moveType = pokemon.getMoveType(move);

      if (pokemon.getTypes().some((t) => t !== moveType)) {
        if (!simulated) {
          this.moveType = moveType;
          pokemon.summonData.types = [ moveType ];
          pokemon.updateInfo();
        }

        return true;
      }
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:pokemonTypeChange", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      moveType: i18next.t(`pokemonInfo:Type.${Type[this.moveType]}`),
    });
  }
}

/**
 * Class for abilities that convert single-strike moves to two-strike moves (i.e. Parental Bond).
 * @param damageMultiplier the damage multiplier for the second strike, relative to the first.
 */
export class AddSecondStrikeAbAttr extends PreAttackAbAttr {
  private damageMultiplier: number;

  constructor(damageMultiplier: number) {
    super(false);

    this.damageMultiplier = damageMultiplier;
  }

  /**
   * If conditions are met, this doubles the move's hit count (via args[1])
   * or multiplies the damage of secondary strikes (via args[2])
   * @param pokemon the {@linkcode Pokemon} using the move
   * @param passive n/a
   * @param defender n/a
   * @param move the {@linkcode Move} used by the ability source
   * @param args Additional arguments:
   * - `[0]` the number of strikes this move currently has ({@linkcode Utils.NumberHolder})
   * - `[1]` the damage multiplier for the current strike ({@linkcode Utils.NumberHolder})
   * @returns
   */
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    const hitCount = args[0] as Utils.NumberHolder;
    const multiplier = args[1] as Utils.NumberHolder;

    if (move.canBeMultiStrikeEnhanced(pokemon, true)) {
      this.showAbility = !!hitCount?.value;
      if (hitCount?.value) {
        hitCount.value += 1;
      }

      if (multiplier?.value && pokemon.turnData.hitsLeft === 1) {
        multiplier.value = this.damageMultiplier;
      }
      return true;
    }
    return false;
  }
}

/**
 * Class for abilities that boost the damage of moves
 * For abilities that boost the base power of moves, see VariableMovePowerAbAttr
 * @param damageMultiplier the amount to multiply the damage by
 * @param condition the condition for this ability to be applied
 */
export class DamageBoostAbAttr extends PreAttackAbAttr {
  private damageMultiplier: number;
  private condition: PokemonAttackCondition;

  constructor(damageMultiplier: number, condition: PokemonAttackCondition) {
    super(true);
    this.damageMultiplier = damageMultiplier;
    this.condition = condition;
  }

  /**
   *
   * @param pokemon the attacker pokemon
   * @param passive N/A
   * @param defender the target pokemon
   * @param move the move used by the attacker pokemon
   * @param args Utils.NumberHolder as damage
   * @returns true if the function succeeds
   */
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    if (this.condition(pokemon, defender, move)) {
      const power = args[0] as Utils.NumberHolder;
      power.value = Math.floor(power.value * this.damageMultiplier);
      return true;
    }

    return false;
  }
}

export class MovePowerBoostAbAttr extends VariableMovePowerAbAttr {
  private condition: PokemonAttackCondition;
  private powerMultiplier: number;

  constructor(condition: PokemonAttackCondition, powerMultiplier: number, showAbility: boolean = true) {
    super(showAbility);
    this.condition = condition;
    this.powerMultiplier = powerMultiplier;
  }

  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, args: any[]): boolean {
    if (this.condition(pokemon, defender, move)) {
      (args[0] as Utils.NumberHolder).value *= this.powerMultiplier;

      return true;
    }

    return false;
  }
}

export class MoveTypePowerBoostAbAttr extends MovePowerBoostAbAttr {
  constructor(boostedType: Type, powerMultiplier?: number) {
    super((pokemon, defender, move) => pokemon?.getMoveType(move) === boostedType, powerMultiplier || 1.5);
  }
}

export class LowHpMoveTypePowerBoostAbAttr extends MoveTypePowerBoostAbAttr {
  constructor(boostedType: Type) {
    super(boostedType);
  }

  getCondition(): AbAttrCondition {
    return (pokemon) => pokemon.getHpRatio() <= 0.33;
  }
}

/**
 * Abilities which cause a variable amount of power increase.
 * @extends VariableMovePowerAbAttr
 * @see {@link applyPreAttack}
 */
export class VariableMovePowerBoostAbAttr extends VariableMovePowerAbAttr {
  private mult: (user: Pokemon, target: Pokemon, move: Move) => number;

  /**
   * @param mult A function which takes the user, target, and move, and returns the power multiplier. 1 means no multiplier.
   * @param {boolean} showAbility Whether to show the ability when it activates.
   */
  constructor(mult: (user: Pokemon, target: Pokemon, move: Move) => number, showAbility: boolean = true) {
    super(showAbility);
    this.mult = mult;
  }

  /**
   * @override
   */
  applyPreAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move, args: any[]): boolean {
    const multiplier = this.mult(pokemon, defender, move);
    if (multiplier !== 1) {
      (args[0] as Utils.NumberHolder).value *= multiplier;
      return true;
    }

    return false;
  }
}

/**
 * Boosts the power of a Pokémon's move under certain conditions.
 * @extends AbAttr
 */
export class FieldMovePowerBoostAbAttr extends AbAttr {
  private condition: PokemonAttackCondition;
  private powerMultiplier: number;

  /**
   * @param condition - A function that determines whether the power boost condition is met.
   * @param powerMultiplier - The multiplier to apply to the move's power when the condition is met.
   */
  constructor(condition: PokemonAttackCondition, powerMultiplier: number) {
    super(false);
    this.condition = condition;
    this.powerMultiplier = powerMultiplier;
  }

  applyPreAttack(pokemon: Pokemon | null, passive: boolean | null, simulated: boolean, defender: Pokemon | null, move: Move, args: any[]): boolean {
    if (this.condition(pokemon, defender, move)) {
      (args[0] as Utils.NumberHolder).value *= this.powerMultiplier;

      return true;
    }

    return false;
  }
}

/**
 * Boosts the power of a specific type of move.
 * @extends FieldMovePowerBoostAbAttr
 */
export class PreAttackFieldMoveTypePowerBoostAbAttr extends FieldMovePowerBoostAbAttr {
  /**
   * @param boostedType - The type of move that will receive the power boost.
   * @param powerMultiplier - The multiplier to apply to the move's power, defaults to 1.5 if not provided.
   */
  constructor(boostedType: Type, powerMultiplier?: number) {
    super((pokemon, defender, move) => pokemon?.getMoveType(move) === boostedType, powerMultiplier || 1.5);
  }
}

/**
 * Boosts the power of a specific type of move for all Pokemon in the field.
 * @extends PreAttackFieldMoveTypePowerBoostAbAttr
 */
export class FieldMoveTypePowerBoostAbAttr extends PreAttackFieldMoveTypePowerBoostAbAttr { }

/**
 * Boosts the power of a specific type of move for the user and its allies.
 * @extends PreAttackFieldMoveTypePowerBoostAbAttr
 */
export class UserFieldMoveTypePowerBoostAbAttr extends PreAttackFieldMoveTypePowerBoostAbAttr { }

/**
 * Boosts the power of moves in specified categories.
 * @extends FieldMovePowerBoostAbAttr
 */
export class AllyMoveCategoryPowerBoostAbAttr extends FieldMovePowerBoostAbAttr {
  /**
   * @param boostedCategories - The categories of moves that will receive the power boost.
   * @param powerMultiplier - The multiplier to apply to the move's power.
   */
  constructor(boostedCategories: MoveCategory[], powerMultiplier: number) {
    super((pokemon, defender, move) => boostedCategories.includes(move.category), powerMultiplier);
  }
}

export class StatMultiplierAbAttr extends AbAttr {
  private stat: BattleStat;
  private multiplier: number;
  private condition: PokemonAttackCondition | null;

  constructor(stat: BattleStat, multiplier: number, condition?: PokemonAttackCondition) {
    super(false);

    this.stat = stat;
    this.multiplier = multiplier;
    this.condition = condition ?? null;
  }

  applyStatStage(pokemon: Pokemon, _passive: boolean, simulated: boolean, stat: BattleStat, statValue: Utils.NumberHolder, args: any[]): boolean | Promise<boolean> {
    const move = (args[0] as Move);
    if (stat === this.stat && (!this.condition || this.condition(pokemon, null, move))) {
      statValue.value *= this.multiplier;
      return true;
    }

    return false;
  }
}

export class PostAttackAbAttr extends AbAttr {
  private attackCondition: PokemonAttackCondition;

  /** The default attackCondition requires that the selected move is a damaging move */
  constructor(attackCondition: PokemonAttackCondition = (user, target, move) => (move.category !== MoveCategory.STATUS), showAbility: boolean = true) {
    super(showAbility);

    this.attackCondition = attackCondition;
  }

  /**
   * Please override {@link applyPostAttackAfterMoveTypeCheck} instead of this method. By default, this method checks that the move used is a damaging attack before
   * applying the effect of any inherited class. This can be changed by providing a different {@link attackCondition} to the constructor. See {@link ConfusionOnStatusEffectAbAttr}
   * for an example of an effect that does not require a damaging move.
   */
  applyPostAttack(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, hitResult: HitResult | null, args: any[]): boolean | Promise<boolean> {
    // When attackRequired is true, we require the move to be an attack move and to deal damage before checking secondary requirements.
    // If attackRequired is false, we always defer to the secondary requirements.
    if (this.attackCondition(pokemon, defender, move)) {
      return this.applyPostAttackAfterMoveTypeCheck(pokemon, passive, simulated, defender, move, hitResult, args);
    } else {
      return false;
    }
  }

  /**
   * This method is only called after {@link applyPostAttack} has already been applied. Use this for handling checks specific to the ability in question.
   */
  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, hitResult: HitResult | null, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Ability attribute for Gorilla Tactics
 * @extends PostAttackAbAttr
 */
export class GorillaTacticsAbAttr extends PostAttackAbAttr {
  constructor() {
    super((user, target, move) => true, false);
  }

  /**
   *
   * @param {Pokemon} pokemon the {@linkcode Pokemon} with this ability
   * @param passive n/a
   * @param simulated whether the ability is being simulated
   * @param defender n/a
   * @param move n/a
   * @param hitResult n/a
   * @param args n/a
   * @returns `true` if the ability is applied
   */
  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, hitResult: HitResult | null, args: any[]): boolean | Promise<boolean> {
    if (simulated) {
      return simulated;
    }

    if (pokemon.getTag(BattlerTagType.GORILLA_TACTICS)) {
      return false;
    }

    pokemon.addTag(BattlerTagType.GORILLA_TACTICS);
    return true;
  }
}

export class PostAttackStealHeldItemAbAttr extends PostAttackAbAttr {
  private stealCondition: PokemonAttackCondition | null;

  constructor(stealCondition?: PokemonAttackCondition) {
    super();

    this.stealCondition = stealCondition ?? null;
  }

  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, hitResult: HitResult, args: any[]): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      if (!simulated && hitResult < HitResult.NO_EFFECT && (!this.stealCondition || this.stealCondition(pokemon, defender, move))) {
        const heldItems = this.getTargetHeldItems(defender).filter(i => i.isTransferable);
        if (heldItems.length) {
          const stolenItem = heldItems[pokemon.randSeedInt(heldItems.length)];
          pokemon.scene.tryTransferHeldItemModifier(stolenItem, pokemon, false).then(success => {
            if (success) {
              pokemon.scene.queueMessage(i18next.t("abilityTriggers:postAttackStealHeldItem", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), defenderName: defender.name, stolenItemType: stolenItem.type.name }));
            }
            resolve(success);
          });
          return;
        }
      }
      resolve(simulated);
    });
  }

  getTargetHeldItems(target: Pokemon): PokemonHeldItemModifier[] {
    return target.scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === target.id, target.isPlayer()) as PokemonHeldItemModifier[];
  }
}

export class PostAttackApplyStatusEffectAbAttr extends PostAttackAbAttr {
  private contactRequired: boolean;
  private chance: integer;
  private effects: StatusEffect[];

  constructor(contactRequired: boolean, chance: integer, ...effects: StatusEffect[]) {
    super();

    this.contactRequired = contactRequired;
    this.chance = chance;
    this.effects = effects;
  }

  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, args: any[]): boolean {
    if (pokemon !== attacker && move.hitsSubstitute(attacker, pokemon)) {
      return false;
    }

    /**Status inflicted by abilities post attacking are also considered additional effects.*/
    if (!attacker.hasAbilityWithAttr(IgnoreMoveEffectsAbAttr) && !simulated && pokemon !== attacker && (!this.contactRequired || move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon)) && pokemon.randSeedInt(100) < this.chance && !pokemon.status) {
      const effect = this.effects.length === 1 ? this.effects[0] : this.effects[pokemon.randSeedInt(this.effects.length)];
      return attacker.trySetStatus(effect, true, pokemon);
    }

    return simulated;
  }
}

export class PostAttackContactApplyStatusEffectAbAttr extends PostAttackApplyStatusEffectAbAttr {
  constructor(chance: integer, ...effects: StatusEffect[]) {
    super(true, chance, ...effects);
  }
}

export class PostAttackApplyBattlerTagAbAttr extends PostAttackAbAttr {
  private contactRequired: boolean;
  private chance: (user: Pokemon, target: Pokemon, move: Move) => integer;
  private effects: BattlerTagType[];


  constructor(contactRequired: boolean, chance: (user: Pokemon, target: Pokemon, move: Move) =>  integer, ...effects: BattlerTagType[]) {
    super();

    this.contactRequired = contactRequired;
    this.chance = chance;
    this.effects = effects;
  }

  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, args: any[]): boolean {
    /**Battler tags inflicted by abilities post attacking are also considered additional effects.*/
    if (!attacker.hasAbilityWithAttr(IgnoreMoveEffectsAbAttr) && pokemon !== attacker && (!this.contactRequired || move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon)) && pokemon.randSeedInt(100) < this.chance(attacker, pokemon, move) && !pokemon.status) {
      const effect = this.effects.length === 1 ? this.effects[0] : this.effects[pokemon.randSeedInt(this.effects.length)];
      return simulated || attacker.addTag(effect);
    }

    return false;
  }
}

export class PostDefendStealHeldItemAbAttr extends PostDefendAbAttr {
  private condition?: PokemonDefendCondition;

  constructor(condition?: PokemonDefendCondition) {
    super();

    this.condition = condition;
  }

  override applyPostDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, _args: any[]): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      if (!simulated && hitResult < HitResult.NO_EFFECT && (!this.condition || this.condition(pokemon, attacker, move)) && !move.hitsSubstitute(attacker, pokemon)) {
        const heldItems = this.getTargetHeldItems(attacker).filter(i => i.isTransferable);
        if (heldItems.length) {
          const stolenItem = heldItems[pokemon.randSeedInt(heldItems.length)];
          pokemon.scene.tryTransferHeldItemModifier(stolenItem, pokemon, false).then(success => {
            if (success) {
              pokemon.scene.queueMessage(i18next.t("abilityTriggers:postDefendStealHeldItem", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), attackerName: attacker.name, stolenItemType: stolenItem.type.name }));
            }
            resolve(success);
          });
          return;
        }
      }
      resolve(simulated);
    });
  }

  getTargetHeldItems(target: Pokemon): PokemonHeldItemModifier[] {
    return target.scene.findModifiers(m => m instanceof PokemonHeldItemModifier
      && m.pokemonId === target.id, target.isPlayer()) as PokemonHeldItemModifier[];
  }
}

/**
 * Base class for defining all {@linkcode Ability} Attributes after a status effect has been set.
 * @see {@linkcode applyPostSetStatus()}.
 */
export class PostSetStatusAbAttr extends AbAttr {
  /**
   * Does nothing after a status condition is set.
   * @param pokemon {@linkcode Pokemon} that status condition was set on.
   * @param sourcePokemon {@linkcode Pokemon} that that set the status condition. Is `null` if status was not set by a Pokemon.
   * @param passive Whether this ability is a passive.
   * @param effect {@linkcode StatusEffect} that was set.
   * @param args Set of unique arguments needed by this attribute.
   * @returns `true` if application of the ability succeeds.
   */
  applyPostSetStatus(pokemon: Pokemon, sourcePokemon: Pokemon | null = null, passive: boolean, effect: StatusEffect, simulated: boolean, args: any[]) : boolean | Promise<boolean> {
    return false;
  }
}

/**
 * If another Pokemon burns, paralyzes, poisons, or badly poisons this Pokemon,
 * that Pokemon receives the same non-volatile status condition as part of this
 * ability attribute. For Synchronize ability.
 */
export class SynchronizeStatusAbAttr extends PostSetStatusAbAttr {
  /**
   * If the `StatusEffect` that was set is Burn, Paralysis, Poison, or Toxic, and the status
   * was set by a source Pokemon, set the source Pokemon's status to the same `StatusEffect`.
   * @param pokemon {@linkcode Pokemon} that status condition was set on.
   * @param sourcePokemon {@linkcode Pokemon} that that set the status condition. Is null if status was not set by a Pokemon.
   * @param passive Whether this ability is a passive.
   * @param effect {@linkcode StatusEffect} that was set.
   * @param args Set of unique arguments needed by this attribute.
   * @returns `true` if application of the ability succeeds.
   */
  override applyPostSetStatus(pokemon: Pokemon, sourcePokemon: Pokemon | null = null, passive: boolean, effect: StatusEffect, simulated: boolean, args: any[]): boolean {
    /** Synchronizable statuses */
    const syncStatuses = new Set<StatusEffect>([
      StatusEffect.BURN,
      StatusEffect.PARALYSIS,
      StatusEffect.POISON,
      StatusEffect.TOXIC
    ]);

    if (sourcePokemon && syncStatuses.has(effect)) {
      if (!simulated) {
        sourcePokemon.trySetStatus(effect, true, pokemon);
      }
      return true;
    }

    return false;
  }
}

export class PostVictoryAbAttr extends AbAttr {
  applyPostVictory(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

class PostVictoryStatStageChangeAbAttr extends PostVictoryAbAttr {
  private stat: BattleStat | ((p: Pokemon) => BattleStat);
  private stages: number;

  constructor(stat: BattleStat | ((p: Pokemon) => BattleStat), stages: number) {
    super();

    this.stat = stat;
    this.stages = stages;
  }

  applyPostVictory(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    const stat = typeof this.stat === "function"
      ? this.stat(pokemon)
      : this.stat;
    if (!simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ stat ], this.stages));
    }
    return true;
  }
}

export class PostVictoryFormChangeAbAttr extends PostVictoryAbAttr {
  private formFunc: (p: Pokemon) => integer;

  constructor(formFunc: ((p: Pokemon) => integer)) {
    super(true);

    this.formFunc = formFunc;
  }

  applyPostVictory(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    const formIndex = this.formFunc(pokemon);
    if (formIndex !== pokemon.formIndex) {
      if (!simulated) {
        pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger, false);
      }
      return true;
    }

    return false;
  }
}

export class PostKnockOutAbAttr extends AbAttr {
  applyPostKnockOut(pokemon: Pokemon, passive: boolean, simulated: boolean, knockedOut: Pokemon, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class PostKnockOutStatStageChangeAbAttr extends PostKnockOutAbAttr {
  private stat: BattleStat | ((p: Pokemon) => BattleStat);
  private stages: number;

  constructor(stat: BattleStat | ((p: Pokemon) => BattleStat), stages: number) {
    super();

    this.stat = stat;
    this.stages = stages;
  }

  applyPostKnockOut(pokemon: Pokemon, passive: boolean, simulated: boolean, knockedOut: Pokemon, args: any[]): boolean | Promise<boolean> {
    const stat = typeof this.stat === "function"
      ? this.stat(pokemon)
      : this.stat;
    if (!simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ stat ], this.stages));
    }
    return true;
  }
}

export class CopyFaintedAllyAbilityAbAttr extends PostKnockOutAbAttr {
  constructor() {
    super();
  }

  applyPostKnockOut(pokemon: Pokemon, passive: boolean, simulated: boolean, knockedOut: Pokemon, args: any[]): boolean | Promise<boolean> {
    if (pokemon.isPlayer() === knockedOut.isPlayer() && !knockedOut.getAbility().hasAttr(UncopiableAbilityAbAttr)) {
      if (!simulated) {
        pokemon.summonData.ability = knockedOut.getAbility().id;
        pokemon.scene.queueMessage(i18next.t("abilityTriggers:copyFaintedAllyAbility", { pokemonNameWithAffix: getPokemonNameWithAffix(knockedOut), abilityName: allAbilities[knockedOut.getAbility().id].name }));
      }
      return true;
    }

    return false;
  }
}

/**
 * Ability attribute for ignoring the opponent's stat changes
 * @param stats the stats that should be ignored
 */
export class IgnoreOpponentStatStagesAbAttr extends AbAttr {
  private stats: readonly BattleStat[];

  constructor(stats?: BattleStat[]) {
    super(false);

    this.stats = stats ?? BATTLE_STATS;
  }

  /**
   * Modifies a BooleanHolder and returns the result to see if a stat is ignored or not
   * @param _pokemon n/a
   * @param _passive n/a
   * @param simulated n/a
   * @param _cancelled n/a
   * @param args A BooleanHolder that represents whether or not to ignore a stat's stat changes
   * @returns true if the stat is ignored, false otherwise
   */
  apply(_pokemon: Pokemon, _passive: boolean, simulated: boolean, _cancelled: Utils.BooleanHolder, args: any[]) {
    if (this.stats.includes(args[0])) {
      (args[1] as Utils.BooleanHolder).value = true;
      return true;
    }
    return false;
  }
}

export class IntimidateImmunityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;
    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:intimidateImmunity", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName
    });
  }
}

export class PostIntimidateStatStageChangeAbAttr extends AbAttr {
  private stats: BattleStat[];
  private stages: number;
  private overwrites: boolean;

  constructor(stats: BattleStat[], stages: number, overwrites?: boolean) {
    super(true);
    this.stats = stats;
    this.stages = stages;
    this.overwrites = !!overwrites;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated:boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!simulated) {
      pokemon.scene.pushPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), false, this.stats, this.stages));
    }
    cancelled.value = this.overwrites;
    return true;
  }
}

/**
 * Base class for defining all {@linkcode Ability} Attributes post summon
 * @see {@linkcode applyPostSummon()}
 */
export class PostSummonAbAttr extends AbAttr {
  /**
   * Applies ability post summon (after switching in)
   * @param pokemon {@linkcode Pokemon} with this ability
   * @param passive Whether this ability is a passive
   * @param args Set of unique arguments needed by this attribute
   * @returns true if application of the ability succeeds
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Removes specified arena tags when a Pokemon is summoned.
 */
export class PostSummonRemoveArenaTagAbAttr extends PostSummonAbAttr {
  private arenaTags: ArenaTagType[];

  /**
   * @param arenaTags {@linkcode ArenaTagType[]} - the arena tags to be removed
   */
  constructor(arenaTags: ArenaTagType[]) {
    super(true);

    this.arenaTags = arenaTags;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (!simulated) {
      for (const arenaTag of this.arenaTags) {
        pokemon.scene.arena.removeTag(arenaTag);
      }
    }
    return true;
  }
}

export class PostSummonMessageAbAttr extends PostSummonAbAttr {
  private messageFunc: (pokemon: Pokemon) => string;

  constructor(messageFunc: (pokemon: Pokemon) => string) {
    super(true);

    this.messageFunc = messageFunc;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!simulated) {
      pokemon.scene.queueMessage(this.messageFunc(pokemon));
    }

    return true;
  }
}

export class PostSummonUnnamedMessageAbAttr extends PostSummonAbAttr {
  //Attr doesn't force pokemon name on the message
  private message: string;

  constructor(message: string) {
    super(true);

    this.message = message;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!simulated) {
      pokemon.scene.queueMessage(this.message);
    }

    return true;
  }
}

export class PostSummonAddBattlerTagAbAttr extends PostSummonAbAttr {
  private tagType: BattlerTagType;
  private turnCount: integer;

  constructor(tagType: BattlerTagType, turnCount: integer, showAbility?: boolean) {
    super(showAbility);

    this.tagType = tagType;
    this.turnCount = turnCount;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (simulated) {
      return pokemon.canAddTag(this.tagType);
    } else {
      return pokemon.addTag(this.tagType, this.turnCount);
    }
  }
}

export class PostSummonStatStageChangeAbAttr extends PostSummonAbAttr {
  private stats: BattleStat[];
  private stages: number;
  private selfTarget: boolean;
  private intimidate: boolean;

  constructor(stats: BattleStat[], stages: number, selfTarget?: boolean, intimidate?: boolean) {
    super(false);

    this.stats = stats;
    this.stages = stages;
    this.selfTarget = !!selfTarget;
    this.intimidate = !!intimidate;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (simulated) {
      return true;
    }

    queueShowAbility(pokemon, passive);  // TODO: Better solution than manually showing the ability here
    if (this.selfTarget) {
      // we unshift the StatStageChangePhase to put it right after the showAbility and not at the end of the
      // phase list (which could be after CommandPhase for example)
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, this.stats, this.stages));
      return true;
    }
    for (const opponent of pokemon.getOpponents()) {
      const cancelled = new Utils.BooleanHolder(false);
      if (this.intimidate) {
        applyAbAttrs(IntimidateImmunityAbAttr, opponent, cancelled, simulated);
        applyAbAttrs(PostIntimidateStatStageChangeAbAttr, opponent, cancelled, simulated);

        if (opponent.getTag(BattlerTagType.SUBSTITUTE)) {
          cancelled.value = true;
        }
      }
      if (!cancelled.value) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, opponent.getBattlerIndex(), false, this.stats, this.stages));
      }
    }
    return true;
  }
}

export class PostSummonAllyHealAbAttr extends PostSummonAbAttr {
  private healRatio: number;
  private showAnim: boolean;

  constructor(healRatio: number, showAnim: boolean = false) {
    super();

    this.healRatio = healRatio || 4;
    this.showAnim = showAnim;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const target = pokemon.getAlly();
    if (target?.isActive(true)) {
      if (!simulated) {
        target.scene.unshiftPhase(new PokemonHealPhase(target.scene, target.getBattlerIndex(),
          Utils.toDmgValue(pokemon.getMaxHp() / this.healRatio), i18next.t("abilityTriggers:postSummonAllyHeal", { pokemonNameWithAffix: getPokemonNameWithAffix(target), pokemonName: pokemon.name }), true, !this.showAnim));
      }

      return true;
    }

    return false;
  }
}

/**
 * Resets an ally's temporary stat boots to zero with no regard to
 * whether this is a positive or negative change
 * @param pokemon The {@link Pokemon} with this {@link AbAttr}
 * @param passive N/A
 * @param args N/A
 * @returns if the move was successful
 */
export class PostSummonClearAllyStatStagesAbAttr extends PostSummonAbAttr {
  constructor() {
    super();
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const target = pokemon.getAlly();
    if (target?.isActive(true)) {
      if (!simulated) {
        for (const s of BATTLE_STATS) {
          target.setStatStage(s, 0);
        }

        target.scene.queueMessage(i18next.t("abilityTriggers:postSummonClearAllyStats", { pokemonNameWithAffix: getPokemonNameWithAffix(target) }));
      }

      return true;
    }

    return false;
  }
}

/**
 * Download raises either the Attack stat or Special Attack stat by one stage depending on the foe's currently lowest defensive stat:
 * it will raise Attack if the foe's current Defense is lower than its current Special Defense stat;
 * otherwise, it will raise Special Attack.
 * @extends PostSummonAbAttr
 * @see {applyPostSummon}
 */
export class DownloadAbAttr extends PostSummonAbAttr {
  private enemyDef: integer;
  private enemySpDef: integer;
  private enemyCountTally: integer;
  private stats: BattleStat[];

  /**
   * Checks to see if it is the opening turn (starting a new game), if so, Download won't work. This is because Download takes into account
   * vitamins and items, so it needs to use the Stat and the stat alone.
   * @param {Pokemon} pokemon Pokemon that is using the move, as well as seeing the opposing pokemon.
   * @param {boolean} passive N/A
   * @param {any[]} args N/A
   * @returns Returns true if ability is used successful, false if not.
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    this.enemyDef = 0;
    this.enemySpDef = 0;
    this.enemyCountTally = 0;

    for (const opponent of pokemon.getOpponents()) {
      this.enemyCountTally++;
      this.enemyDef += opponent.getEffectiveStat(Stat.DEF);
      this.enemySpDef += opponent.getEffectiveStat(Stat.SPDEF);
    }
    this.enemyDef = Math.round(this.enemyDef / this.enemyCountTally);
    this.enemySpDef = Math.round(this.enemySpDef / this.enemyCountTally);

    if (this.enemyDef < this.enemySpDef) {
      this.stats = [ Stat.ATK ];
    } else {
      this.stats = [ Stat.SPATK ];
    }

    if (this.enemyDef > 0 && this.enemySpDef > 0) { // only activate if there's actually an enemy to download from
      if (!simulated) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), false, this.stats, 1));
      }
      return true;
    }

    return false;
  }
}

export class PostSummonWeatherChangeAbAttr extends PostSummonAbAttr {
  private weatherType: WeatherType;

  constructor(weatherType: WeatherType) {
    super();

    this.weatherType = weatherType;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if ((this.weatherType === WeatherType.HEAVY_RAIN ||
      this.weatherType === WeatherType.HARSH_SUN ||
      this.weatherType === WeatherType.STRONG_WINDS) || !pokemon.scene.arena.weather?.isImmutable()) {
      if (simulated) {
        return pokemon.scene.arena.weather?.weatherType !== this.weatherType;
      } else {
        return pokemon.scene.arena.trySetWeather(this.weatherType, true);
      }
    }

    return false;
  }
}

export class PostSummonTerrainChangeAbAttr extends PostSummonAbAttr {
  private terrainType: TerrainType;

  constructor(terrainType: TerrainType) {
    super();

    this.terrainType = terrainType;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (simulated) {
      return pokemon.scene.arena.terrain?.terrainType !== this.terrainType;
    } else {
      return pokemon.scene.arena.trySetTerrain(this.terrainType, true);
    }
  }
}

export class PostSummonFormChangeAbAttr extends PostSummonAbAttr {
  private formFunc: (p: Pokemon) => integer;

  constructor(formFunc: ((p: Pokemon) => integer)) {
    super(true);

    this.formFunc = formFunc;
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const formIndex = this.formFunc(pokemon);
    if (formIndex !== pokemon.formIndex) {
      return simulated || pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger, false);
    }

    return false;
  }
}

/** Attempts to copy a pokemon's ability */
export class PostSummonCopyAbilityAbAttr extends PostSummonAbAttr {
  private target: Pokemon;
  private targetAbilityName: string;

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const targets = pokemon.getOpponents();
    if (!targets.length) {
      return false;
    }

    let target: Pokemon;
    if (targets.length > 1) {
      pokemon.scene.executeWithSeedOffset(() => target = Utils.randSeedItem(targets), pokemon.scene.currentBattle.waveIndex);
    } else {
      target = targets[0];
    }

    if (
      target!.getAbility().hasAttr(UncopiableAbilityAbAttr) &&
      // Wonder Guard is normally uncopiable so has the attribute, but Trace specifically can copy it
      !(pokemon.hasAbility(Abilities.TRACE) && target!.getAbility().id === Abilities.WONDER_GUARD)
    ) {
      return false;
    }

    if (!simulated) {
      this.target = target!;
      this.targetAbilityName = allAbilities[target!.getAbility().id].name;
      pokemon.summonData.ability = target!.getAbility().id;
      setAbilityRevealed(target!);
      pokemon.updateInfo();
    }

    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:trace", {
      pokemonName: getPokemonNameWithAffix(pokemon),
      targetName: getPokemonNameWithAffix(this.target),
      abilityName: this.targetAbilityName,
    });
  }
}

/**
 * Removes supplied status effects from the user's field.
 */
export class PostSummonUserFieldRemoveStatusEffectAbAttr extends PostSummonAbAttr {
  private statusEffect: StatusEffect[];

  /**
   * @param statusEffect - The status effects to be removed from the user's field.
   */
  constructor(...statusEffect: StatusEffect[]) {
    super(false);

    this.statusEffect = statusEffect;
  }

  /**
   * Removes supplied status effect from the user's field when user of the ability is summoned.
   *
   * @param pokemon - The Pokémon that triggered the ability.
   * @param passive - n/a
   * @param args - n/a
   * @returns A boolean or a promise that resolves to a boolean indicating the result of the ability application.
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    const party = pokemon instanceof PlayerPokemon ? pokemon.scene.getPlayerField() : pokemon.scene.getEnemyField();
    const allowedParty = party.filter(p => p.isAllowedInBattle());

    if (allowedParty.length < 1) {
      return false;
    }

    if (!simulated) {
      for (const pokemon of allowedParty) {
        if (pokemon.status && this.statusEffect.includes(pokemon.status.effect)) {
          pokemon.scene.queueMessage(getStatusEffectHealText(pokemon.status.effect, getPokemonNameWithAffix(pokemon)));
          pokemon.resetStatus(false);
          pokemon.updateInfo();
        }
      }
    }
    return true;
  }
}


/** Attempt to copy the stat changes on an ally pokemon */
export class PostSummonCopyAllyStatsAbAttr extends PostSummonAbAttr {
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!pokemon.scene.currentBattle.double) {
      return false;
    }

    const ally = pokemon.getAlly();
    if (!ally || ally.getStatStages().every(s => s === 0)) {
      return false;
    }

    if (!simulated) {
      for (const s of BATTLE_STATS) {
        pokemon.setStatStage(s, ally.getStatStage(s));
      }
      pokemon.updateInfo();
    }

    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:costar", {
      pokemonName: getPokemonNameWithAffix(pokemon),
      allyName: getPokemonNameWithAffix(pokemon.getAlly()),
    });
  }
}

/**
 * Used by Imposter
 */
export class PostSummonTransformAbAttr extends PostSummonAbAttr {
  constructor() {
    super(true);
  }

  async applyPostSummon(pokemon: Pokemon, _passive: boolean, simulated: boolean, _args: any[]): Promise<boolean> {
    const targets = pokemon.getOpponents();
    if (simulated || !targets.length) {
      return simulated;
    }
    const promises: Promise<void>[] = [];

    let target: Pokemon;
    if (targets.length > 1) {
      pokemon.scene.executeWithSeedOffset(() => {
        // in a double battle, if one of the opposing pokemon is fused the other one will be chosen
        // if both are fused, then Imposter will fail below
        if (targets[0].fusionSpecies) {
          target = targets[1];
          return;
        } else if (targets[1].fusionSpecies) {
          target = targets[0];
          return;
        }
        target = Utils.randSeedItem(targets);
      }, pokemon.scene.currentBattle.waveIndex);
    } else {
      target = targets[0];
    }
    target = target!;

    // transforming from or into fusion pokemon causes various problems (including crashes and save corruption)
    if (target.fusionSpecies || pokemon.fusionSpecies) {
      return false;
    }

    pokemon.summonData.speciesForm = target.getSpeciesForm();
    pokemon.summonData.ability = target.getAbility().id;
    pokemon.summonData.gender = target.getGender();

    // Copy all stats (except HP)
    for (const s of EFFECTIVE_STATS) {
      pokemon.setStat(s, target.getStat(s, false), false);
    }

    // Copy all stat stages
    for (const s of BATTLE_STATS) {
      pokemon.setStatStage(s, target.getStatStage(s));
    }

    pokemon.summonData.moveset = target.getMoveset().map((m) => {
      if (m) {
        // If PP value is less than 5, do nothing. If greater, we need to reduce the value to 5.
        return new PokemonMove(m.moveId, 0, 0, false, Math.min(m.getMove().pp, 5));
      } else {
        console.warn(`Imposter: somehow iterating over a ${m} value when copying moveset!`);
        return new PokemonMove(Moves.NONE);
      }
    });
    pokemon.summonData.types = target.getTypes();
    promises.push(pokemon.updateInfo());

    pokemon.scene.queueMessage(i18next.t("abilityTriggers:postSummonTransform", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), targetName: target.name, }));
    pokemon.scene.playSound("battle_anims/PRSFX- Transform");
    promises.push(pokemon.loadAssets(false).then(() => {
      pokemon.playAnim();
      pokemon.updateInfo();
    }));

    await Promise.all(promises);

    return true;
  }
}

/**
 * Reverts weather-based forms to their normal forms when the user is summoned.
 * Used by Cloud Nine and Air Lock.
 * @extends PostSummonAbAttr
 */
export class PostSummonWeatherSuppressedFormChangeAbAttr extends PostSummonAbAttr {
  /**
   * Triggers {@linkcode Arena.triggerWeatherBasedFormChangesToNormal | triggerWeatherBasedFormChangesToNormal}
   * @param {Pokemon} pokemon the Pokemon with this ability
   * @param passive n/a
   * @param args n/a
   * @returns whether a Pokemon was reverted to its normal form
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]) {
    const pokemonToTransform = getPokemonWithWeatherBasedForms(pokemon.scene);

    if (pokemonToTransform.length < 1) {
      return false;
    }

    if (!simulated) {
      pokemon.scene.arena.triggerWeatherBasedFormChangesToNormal();
    }

    return true;
  }
}

/**
 * Triggers weather-based form change when summoned into an active weather.
 * Used by Forecast and Flower Gift.
 * @extends PostSummonAbAttr
 */
export class PostSummonFormChangeByWeatherAbAttr extends PostSummonAbAttr {
  private ability: Abilities;

  constructor(ability: Abilities) {
    super(false);

    this.ability = ability;
  }

  /**
   * Calls the {@linkcode BattleScene.triggerPokemonFormChange | triggerPokemonFormChange} for both
   * {@linkcode SpeciesFormChange.SpeciesFormChangeWeatherTrigger | SpeciesFormChangeWeatherTrigger} and
   * {@linkcode SpeciesFormChange.SpeciesFormChangeWeatherTrigger | SpeciesFormChangeRevertWeatherFormTrigger} if it
   * is the specific Pokemon and ability
   * @param {Pokemon} pokemon the Pokemon with this ability
   * @param passive n/a
   * @param args n/a
   * @returns whether the form change was triggered
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const isCastformWithForecast = (pokemon.species.speciesId === Species.CASTFORM && this.ability === Abilities.FORECAST);
    const isCherrimWithFlowerGift = (pokemon.species.speciesId === Species.CHERRIM && this.ability === Abilities.FLOWER_GIFT);

    if (isCastformWithForecast || isCherrimWithFlowerGift) {
      if (simulated) {
        return simulated;
      }

      pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeWeatherTrigger);
      pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeRevertWeatherFormTrigger);
      queueShowAbility(pokemon, passive);
      return true;
    }
    return false;
  }
}

/**
 * Attribute implementing the effects of {@link https://bulbapedia.bulbagarden.net/wiki/Commander_(Ability) | Commander}.
 * When the source of an ability with this attribute detects a Dondozo as their active ally, the source "jumps
 * into the Dondozo's mouth," sharply boosting the Dondozo's stats, cancelling the source's moves, and
 * causing attacks that target the source to always miss.
 */
export class CommanderAbAttr extends AbAttr {
  constructor() {
    super(true);
  }

  override apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: null, args: any[]): boolean {
    // TODO: Should this work with X + Dondozo fusions?
    if (pokemon.scene.currentBattle?.double && pokemon.getAlly()?.species.speciesId === Species.DONDOZO) {
      // If the ally Dondozo is fainted or was previously "commanded" by
      // another Pokemon, this effect cannot apply.
      if (pokemon.getAlly().isFainted() || pokemon.getAlly().getTag(BattlerTagType.COMMANDED)) {
        return false;
      }

      if (!simulated) {
        // Lapse the source's semi-invulnerable tags (to avoid visual inconsistencies)
        pokemon.lapseTags(BattlerTagLapseType.MOVE_EFFECT);
        // Play an animation of the source jumping into the ally Dondozo's mouth
        pokemon.scene.triggerPokemonBattleAnim(pokemon, PokemonAnimType.COMMANDER_APPLY);
        // Apply boosts from this effect to the ally Dondozo
        pokemon.getAlly().addTag(BattlerTagType.COMMANDED, 0, Moves.NONE, pokemon.id);
        // Cancel the source Pokemon's next move (if a move is queued)
        pokemon.scene.tryRemovePhase((phase) => phase instanceof MovePhase && phase.pokemon === pokemon);
      }
      return true;
    }
    return false;
  }
}

export class PreSwitchOutAbAttr extends AbAttr {
  constructor() {
    super(true);
  }

  applyPreSwitchOut(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class PreSwitchOutResetStatusAbAttr extends PreSwitchOutAbAttr {
  applyPreSwitchOut(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (pokemon.status) {
      if (!simulated) {
        pokemon.resetStatus();
        pokemon.updateInfo();
      }

      return true;
    }

    return false;
  }
}

/**
 * Clears Desolate Land/Primordial Sea/Delta Stream upon the Pokemon switching out.
 */
export class PreSwitchOutClearWeatherAbAttr extends PreSwitchOutAbAttr {

  /**
   * @param pokemon The {@linkcode Pokemon} with the ability
   * @param passive N/A
   * @param args N/A
   * @returns {boolean} Returns true if the weather clears, otherwise false.
   */
  applyPreSwitchOut(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    const weatherType = pokemon.scene.arena.weather?.weatherType;
    let turnOffWeather = false;

    // Clear weather only if user's ability matches the weather and no other pokemon has the ability.
    switch (weatherType) {
      case (WeatherType.HARSH_SUN):
        if (pokemon.hasAbility(Abilities.DESOLATE_LAND)
          && pokemon.scene.getField(true).filter(p => p !== pokemon).filter(p => p.hasAbility(Abilities.DESOLATE_LAND)).length === 0) {
          turnOffWeather = true;
        }
        break;
      case (WeatherType.HEAVY_RAIN):
        if (pokemon.hasAbility(Abilities.PRIMORDIAL_SEA)
          && pokemon.scene.getField(true).filter(p => p !== pokemon).filter(p => p.hasAbility(Abilities.PRIMORDIAL_SEA)).length === 0) {
          turnOffWeather = true;
        }
        break;
      case (WeatherType.STRONG_WINDS):
        if (pokemon.hasAbility(Abilities.DELTA_STREAM)
          && pokemon.scene.getField(true).filter(p => p !== pokemon).filter(p => p.hasAbility(Abilities.DELTA_STREAM)).length === 0) {
          turnOffWeather = true;
        }
        break;
    }

    if (simulated) {
      return turnOffWeather;
    }

    if (turnOffWeather) {
      pokemon.scene.arena.trySetWeather(WeatherType.NONE, false);
      return true;
    }

    return false;
  }
}

export class PreSwitchOutHealAbAttr extends PreSwitchOutAbAttr {
  applyPreSwitchOut(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (!pokemon.isFullHp()) {
      if (!simulated) {
        const healAmount = Utils.toDmgValue(pokemon.getMaxHp() * 0.33);
        pokemon.heal(healAmount);
        pokemon.updateInfo();
      }

      return true;
    }

    return false;
  }
}

/**
 * Attribute for form changes that occur on switching out
 * @extends PreSwitchOutAbAttr
 * @see {@linkcode applyPreSwitchOut}
 */
export class PreSwitchOutFormChangeAbAttr extends PreSwitchOutAbAttr {
  private formFunc: (p: Pokemon) => integer;

  constructor(formFunc: ((p: Pokemon) => integer)) {
    super();

    this.formFunc = formFunc;
  }

  /**
   * On switch out, trigger the form change to the one defined in the ability
   * @param pokemon The pokemon switching out and changing form {@linkcode Pokemon}
   * @param passive N/A
   * @param args N/A
   * @returns true if the form change was successful
   */
  applyPreSwitchOut(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    const formIndex = this.formFunc(pokemon);
    if (formIndex !== pokemon.formIndex) {
      if (!simulated) {
        pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger, false);
      }
      return true;
    }

    return false;
  }

}

export class PreStatStageChangeAbAttr extends AbAttr {
  applyPreStatStageChange(pokemon: Pokemon | null, passive: boolean, simulated: boolean, stat: BattleStat, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Protect one or all {@linkcode BattleStat} from reductions caused by other Pokémon's moves and Abilities
 */
export class ProtectStatAbAttr extends PreStatStageChangeAbAttr {
  /** {@linkcode BattleStat} to protect or `undefined` if **all** {@linkcode BattleStat} are protected */
  private protectedStat?: BattleStat;

  constructor(protectedStat?: BattleStat) {
    super();

    this.protectedStat = protectedStat;
  }

  /**
   * Apply the {@linkcode ProtectedStatAbAttr} to an interaction
   * @param _pokemon
   * @param _passive
   * @param simulated
   * @param stat the {@linkcode BattleStat} being affected
   * @param cancelled The {@linkcode Utils.BooleanHolder} that will be set to true if the stat is protected
   * @param _args
   * @returns true if the stat is protected, false otherwise
   */
  applyPreStatStageChange(_pokemon: Pokemon, _passive: boolean, _simulated: boolean, stat: BattleStat, cancelled: Utils.BooleanHolder, _args: any[]): boolean {
    if (Utils.isNullOrUndefined(this.protectedStat) || stat === this.protectedStat) {
      cancelled.value = true;
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return i18next.t("abilityTriggers:protectStat", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName,
      statName: this.protectedStat ? i18next.t(getStatKey(this.protectedStat)) : i18next.t("battle:stats")
    });
  }
}

/**
 * This attribute applies confusion to the target whenever the user
 * directly poisons them with a move, e.g. Poison Puppeteer.
 * Called in {@linkcode StatusEffectAttr}.
 * @extends PostAttackAbAttr
 * @see {@linkcode applyPostAttack}
 */
export class ConfusionOnStatusEffectAbAttr extends PostAttackAbAttr {
  /** List of effects to apply confusion after */
  private effects: StatusEffect[];

  constructor(...effects: StatusEffect[]) {
    /** This effect does not require a damaging move */
    super((user, target, move) => true);
    this.effects = effects;
  }
  /**
   * Applies confusion to the target pokemon.
   * @param pokemon {@link Pokemon} attacking
   * @param passive N/A
   * @param defender {@link Pokemon} defending
   * @param move {@link Move} used to apply status effect and confusion
   * @param hitResult N/A
   * @param args [0] {@linkcode StatusEffect} applied by move
   * @returns true if defender is confused
   */
  applyPostAttackAfterMoveTypeCheck(pokemon: Pokemon, passive: boolean, simulated: boolean, defender: Pokemon, move: Move, hitResult: HitResult, args: any[]): boolean {
    if (this.effects.indexOf(args[0]) > -1 && !defender.isFainted()) {
      if (simulated) {
        return defender.canAddTag(BattlerTagType.CONFUSED);
      } else {
        return defender.addTag(BattlerTagType.CONFUSED, pokemon.randSeedIntRange(2, 5), move.id, defender.id);
      }
    }
    return false;
  }
}

export class PreSetStatusAbAttr extends AbAttr {
  applyPreSetStatus(pokemon: Pokemon, passive: boolean, simulated: boolean, effect: StatusEffect | undefined, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Provides immunity to status effects to specified targets.
 */
export class PreSetStatusEffectImmunityAbAttr extends PreSetStatusAbAttr {
  private immuneEffects: StatusEffect[];

  /**
   * @param immuneEffects - The status effects to which the Pokémon is immune.
   */
  constructor(...immuneEffects: StatusEffect[]) {
    super();

    this.immuneEffects = immuneEffects;
  }

  /**
   * Applies immunity to supplied status effects.
   *
   * @param pokemon - The Pokémon to which the status is being applied.
   * @param passive - n/a
   * @param effect - The status effect being applied.
   * @param cancelled - A holder for a boolean value indicating if the status application was cancelled.
   * @param args - n/a
   * @returns A boolean indicating the result of the status application.
   */
  applyPreSetStatus(pokemon: Pokemon, passive: boolean, simulated: boolean, effect: StatusEffect, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.immuneEffects.length < 1 || this.immuneEffects.includes(effect)) {
      cancelled.value = true;
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return this.immuneEffects.length ?
      i18next.t("abilityTriggers:statusEffectImmunityWithName", {
        pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
        abilityName,
        statusEffectName: getStatusEffectDescriptor(args[0] as StatusEffect)
      }) :
      i18next.t("abilityTriggers:statusEffectImmunity", {
        pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
        abilityName
      });
  }
}

/**
 * Provides immunity to status effects to the user.
 * @extends PreSetStatusEffectImmunityAbAttr
 */
export class StatusEffectImmunityAbAttr extends PreSetStatusEffectImmunityAbAttr { }

/**
 * Provides immunity to status effects to the user's field.
 * @extends PreSetStatusEffectImmunityAbAttr
 */
export class UserFieldStatusEffectImmunityAbAttr extends PreSetStatusEffectImmunityAbAttr { }

export class PreApplyBattlerTagAbAttr extends AbAttr {
  applyPreApplyBattlerTag(pokemon: Pokemon, passive: boolean, simulated: boolean, tag: BattlerTag, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Provides immunity to BattlerTags {@linkcode BattlerTag} to specified targets.
 */
export class PreApplyBattlerTagImmunityAbAttr extends PreApplyBattlerTagAbAttr {
  private immuneTagTypes: BattlerTagType[];
  private battlerTag: BattlerTag;

  constructor(immuneTagTypes: BattlerTagType | BattlerTagType[]) {
    super();

    this.immuneTagTypes = Array.isArray(immuneTagTypes) ? immuneTagTypes : [ immuneTagTypes ];
  }

  applyPreApplyBattlerTag(pokemon: Pokemon, passive: boolean, simulated: boolean, tag: BattlerTag, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.immuneTagTypes.includes(tag.tagType)) {
      cancelled.value = true;
      if (!simulated) {
        this.battlerTag = tag;
      }
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:battlerTagImmunity", {
      pokemonNameWithAffix: getPokemonNameWithAffix(pokemon),
      abilityName,
      battlerTagName: this.battlerTag.getDescriptor()
    });
  }
}

/**
 * Provides immunity to BattlerTags {@linkcode BattlerTag} to the user.
 * @extends PreApplyBattlerTagImmunityAbAttr
 */
export class BattlerTagImmunityAbAttr extends PreApplyBattlerTagImmunityAbAttr { }

/**
 * Provides immunity to BattlerTags {@linkcode BattlerTag} to the user's field.
 * @extends PreApplyBattlerTagImmunityAbAttr
 */
export class UserFieldBattlerTagImmunityAbAttr extends PreApplyBattlerTagImmunityAbAttr { }

export class BlockCritAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.BooleanHolder).value = true;
    return true;
  }
}

export class BonusCritAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.BooleanHolder).value = true;
    return true;
  }
}

export class MultCritAbAttr extends AbAttr {
  public multAmount: number;

  constructor(multAmount: number) {
    super(true);

    this.multAmount = multAmount;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const critMult = args[0] as Utils.NumberHolder;
    if (critMult.value > 1) {
      critMult.value *= this.multAmount;
      return true;
    }

    return false;
  }
}

/**
 * Guarantees a critical hit according to the given condition, except if target prevents critical hits. ie. Merciless
 * @extends AbAttr
 * @see {@linkcode apply}
 */
export class ConditionalCritAbAttr extends AbAttr {
  private condition: PokemonAttackCondition;

  constructor(condition: PokemonAttackCondition, checkUser?: Boolean) {
    super();

    this.condition = condition;
  }

  /**
   * @param pokemon {@linkcode Pokemon} user.
   * @param args [0] {@linkcode Utils.BooleanHolder} If true critical hit is guaranteed.
   *             [1] {@linkcode Pokemon} Target.
   *             [2] {@linkcode Move} used by ability user.
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const target = (args[1] as Pokemon);
    const move = (args[2] as Move);
    if (!this.condition(pokemon, target, move)) {
      return false;
    }

    (args[0] as Utils.BooleanHolder).value = true;
    return true;
  }
}

export class BlockNonDirectDamageAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;
    return true;
  }
}

/**
 * This attribute will block any status damage that you put in the parameter.
 */
export class BlockStatusDamageAbAttr extends AbAttr {
  private effects: StatusEffect[];

  /**
   * @param {StatusEffect[]} effects The status effect(s) that will be blocked from damaging the ability pokemon
   */
  constructor(...effects: StatusEffect[]) {
    super(false);

    this.effects = effects;
  }

  /**
   * @param {Pokemon} pokemon The pokemon with the ability
   * @param {boolean} passive N/A
   * @param {Utils.BooleanHolder} cancelled Whether to cancel the status damage
   * @param {any[]} args N/A
   * @returns Returns true if status damage is blocked
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (pokemon.status && this.effects.includes(pokemon.status.effect)) {
      cancelled.value = true;
      return true;
    }
    return false;
  }
}

export class BlockOneHitKOAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;
    return true;
  }
}

/**
 * This governs abilities that alter the priority of moves
 * Abilities: Prankster, Gale Wings, Triage, Mycelium Might, Stall
 * Note - Quick Claw has a separate and distinct implementation outside of priority
 */
export class ChangeMovePriorityAbAttr extends AbAttr {
  private moveFunc: (pokemon: Pokemon, move: Move) => boolean;
  private changeAmount: number;

  /**
   * @param {(pokemon, move) => boolean} moveFunc applies priority-change to moves within a provided category
   * @param {number} changeAmount the amount of priority added or subtracted
   */
  constructor(moveFunc: (pokemon: Pokemon, move: Move) => boolean, changeAmount: number) {
    super(true);

    this.moveFunc = moveFunc;
    this.changeAmount = changeAmount;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!this.moveFunc(pokemon, args[0] as Move)) {
      return false;
    }

    (args[1] as Utils.IntegerHolder).value += this.changeAmount;
    return true;
  }
}

export class IgnoreContactAbAttr extends AbAttr { }

export class PreWeatherEffectAbAttr extends AbAttr {
  applyPreWeatherEffect(pokemon: Pokemon, passive: Boolean, simulated: boolean, weather: Weather | null, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

export class PreWeatherDamageAbAttr extends PreWeatherEffectAbAttr { }

export class BlockWeatherDamageAttr extends PreWeatherDamageAbAttr {
  private weatherTypes: WeatherType[];

  constructor(...weatherTypes: WeatherType[]) {
    super();

    this.weatherTypes = weatherTypes;
  }

  applyPreWeatherEffect(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: Weather, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!this.weatherTypes.length || this.weatherTypes.indexOf(weather?.weatherType) > -1) {
      cancelled.value = true;
    }

    return true;
  }
}

export class SuppressWeatherEffectAbAttr extends PreWeatherEffectAbAttr {
  public affectsImmutable: boolean;

  constructor(affectsImmutable?: boolean) {
    super();

    this.affectsImmutable = !!affectsImmutable;
  }

  applyPreWeatherEffect(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: Weather, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.affectsImmutable || weather.isImmutable()) {
      cancelled.value = true;
      return true;
    }

    return false;
  }
}

/**
 * Condition function to applied to abilities related to Sheer Force.
 * Checks if last move used against target was affected by a Sheer Force user and:
 * Disables: Color Change, Pickpocket, Berserk, Anger Shell
 * @returns {AbAttrCondition} If false disables the ability which the condition is applied to.
 */
function getSheerForceHitDisableAbCondition(): AbAttrCondition {
  return (pokemon: Pokemon) => {
    if (!pokemon.turnData) {
      return true;
    }

    const lastReceivedAttack = pokemon.turnData.attacksReceived[0];
    if (!lastReceivedAttack) {
      return true;
    }

    const lastAttacker = pokemon.getOpponents().find(p => p.id === lastReceivedAttack.sourceId);
    if (!lastAttacker) {
      return true;
    }

    /**if the last move chance is greater than or equal to cero, and the last attacker's ability is sheer force*/
    const SheerForceAffected = allMoves[lastReceivedAttack.move].chance >= 0 && lastAttacker.hasAbility(Abilities.SHEER_FORCE);

    return !SheerForceAffected;
  };
}

function getWeatherCondition(...weatherTypes: WeatherType[]): AbAttrCondition {
  return (pokemon: Pokemon) => {
    if (!pokemon.scene?.arena) {
      return false;
    }
    if (pokemon.scene.arena.weather?.isEffectSuppressed(pokemon.scene)) {
      return false;
    }
    const weatherType = pokemon.scene.arena.weather?.weatherType;
    return !!weatherType && weatherTypes.indexOf(weatherType) > -1;
  };
}

function getAnticipationCondition(): AbAttrCondition {
  return (pokemon: Pokemon) => {
    for (const opponent of pokemon.getOpponents()) {
      for (const move of opponent.moveset) {
        // ignore null/undefined moves
        if (!move) {
          continue;
        }
        // the move's base type (not accounting for variable type changes) is super effective
        if (move.getMove() instanceof AttackMove && pokemon.getAttackTypeEffectiveness(move.getMove().type, opponent, true, undefined, move.getMove()) >= 2) {
          return true;
        }
        // move is a OHKO
        if (move.getMove().hasAttr(OneHitKOAttr)) {
          return true;
        }
        // edge case for hidden power, type is computed
        if (move.getMove().id === Moves.HIDDEN_POWER) {
          const iv_val = Math.floor(((opponent.ivs[Stat.HP] & 1)
              + (opponent.ivs[Stat.ATK] & 1) * 2
              + (opponent.ivs[Stat.DEF] & 1) * 4
              + (opponent.ivs[Stat.SPD] & 1) * 8
              + (opponent.ivs[Stat.SPATK] & 1) * 16
              + (opponent.ivs[Stat.SPDEF] & 1) * 32) * 15 / 63);

          const type = [
            Type.FIGHTING, Type.FLYING, Type.POISON, Type.GROUND,
            Type.ROCK, Type.BUG, Type.GHOST, Type.STEEL,
            Type.FIRE, Type.WATER, Type.GRASS, Type.ELECTRIC,
            Type.PSYCHIC, Type.ICE, Type.DRAGON, Type.DARK ][iv_val];

          if (pokemon.getAttackTypeEffectiveness(type, opponent) >= 2) {
            return true;
          }
        }
      }
    }
    return false;
  };
}

/**
 * Creates an ability condition that causes the ability to fail if that ability
 * has already been used by that pokemon that battle. It requires an ability to
 * be specified due to current limitations in how conditions on abilities work.
 * @param {Abilities} ability The ability to check if it's already been applied
 * @returns {AbAttrCondition} The condition
 */
function getOncePerBattleCondition(ability: Abilities): AbAttrCondition {
  return (pokemon: Pokemon) => {
    return !pokemon.battleData?.abilitiesApplied.includes(ability);
  };
}

export class ForewarnAbAttr extends PostSummonAbAttr {
  constructor() {
    super(true);
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    let maxPowerSeen = 0;
    let maxMove = "";
    let movePower = 0;
    for (const opponent of pokemon.getOpponents()) {
      for (const move of opponent.moveset) {
        if (move?.getMove() instanceof StatusMove) {
          movePower = 1;
        } else if (move?.getMove().hasAttr(OneHitKOAttr)) {
          movePower = 150;
        } else if (move?.getMove().id === Moves.COUNTER || move?.getMove().id === Moves.MIRROR_COAT || move?.getMove().id === Moves.METAL_BURST) {
          movePower = 120;
        } else if (move?.getMove().power === -1) {
          movePower = 80;
        } else {
          movePower = move?.getMove().power ?? 0;
        }

        if (movePower > maxPowerSeen) {
          maxPowerSeen = movePower;
          maxMove = move?.getName() ?? "";
        }
      }
    }
    if (!simulated) {
      pokemon.scene.queueMessage(i18next.t("abilityTriggers:forewarn", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), moveName: maxMove }));
    }
    return true;
  }
}

export class FriskAbAttr extends PostSummonAbAttr {
  constructor() {
    super(true);
  }

  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!simulated) {
      for (const opponent of pokemon.getOpponents()) {
        pokemon.scene.queueMessage(i18next.t("abilityTriggers:frisk", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), opponentName: opponent.name, opponentAbilityName: opponent.getAbility().name }));
        setAbilityRevealed(opponent);
      }
    }
    return true;
  }
}

export class PostWeatherChangeAbAttr extends AbAttr {
  applyPostWeatherChange(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: WeatherType, args: any[]): boolean {
    return false;
  }
}

/**
 * Triggers weather-based form change when weather changes.
 * Used by Forecast and Flower Gift.
 * @extends PostWeatherChangeAbAttr
 */
export class PostWeatherChangeFormChangeAbAttr extends PostWeatherChangeAbAttr {
  private ability: Abilities;
  private formRevertingWeathers: WeatherType[];

  constructor(ability: Abilities, formRevertingWeathers: WeatherType[]) {
    super(false);

    this.ability = ability;
    this.formRevertingWeathers = formRevertingWeathers;
  }

  /**
   * Calls {@linkcode Arena.triggerWeatherBasedFormChangesToNormal | triggerWeatherBasedFormChangesToNormal} when the
   * weather changed to form-reverting weather, otherwise calls {@linkcode Arena.triggerWeatherBasedFormChanges | triggerWeatherBasedFormChanges}
   * @param {Pokemon} pokemon the Pokemon with this ability
   * @param passive n/a
   * @param weather n/a
   * @param args n/a
   * @returns whether the form change was triggered
   */
  applyPostWeatherChange(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: WeatherType, args: any[]): boolean {
    const isCastformWithForecast = (pokemon.species.speciesId === Species.CASTFORM && this.ability === Abilities.FORECAST);
    const isCherrimWithFlowerGift = (pokemon.species.speciesId === Species.CHERRIM && this.ability === Abilities.FLOWER_GIFT);

    if (isCastformWithForecast || isCherrimWithFlowerGift) {
      if (simulated) {
        return simulated;
      }

      const weatherType = pokemon.scene.arena.weather?.weatherType;

      if (weatherType && this.formRevertingWeathers.includes(weatherType)) {
        pokemon.scene.arena.triggerWeatherBasedFormChangesToNormal();
      } else {
        pokemon.scene.arena.triggerWeatherBasedFormChanges();
      }
      return true;
    }
    return false;
  }
}

export class PostWeatherChangeAddBattlerTagAttr extends PostWeatherChangeAbAttr {
  private tagType: BattlerTagType;
  private turnCount: integer;
  private weatherTypes: WeatherType[];

  constructor(tagType: BattlerTagType, turnCount: integer, ...weatherTypes: WeatherType[]) {
    super();

    this.tagType = tagType;
    this.turnCount = turnCount;
    this.weatherTypes = weatherTypes;
  }

  applyPostWeatherChange(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: WeatherType, args: any[]): boolean {
    console.log(this.weatherTypes.find(w => weather === w), WeatherType[weather]);
    if (!this.weatherTypes.find(w => weather === w)) {
      return false;
    }

    if (simulated) {
      return pokemon.canAddTag(this.tagType);
    } else {
      return pokemon.addTag(this.tagType, this.turnCount);
    }
  }
}

export class PostWeatherLapseAbAttr extends AbAttr {
  protected weatherTypes: WeatherType[];

  constructor(...weatherTypes: WeatherType[]) {
    super();

    this.weatherTypes = weatherTypes;
  }

  applyPostWeatherLapse(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: Weather | null, args: any[]): boolean | Promise<boolean> {
    return false;
  }

  getCondition(): AbAttrCondition {
    return getWeatherCondition(...this.weatherTypes);
  }
}

export class PostWeatherLapseHealAbAttr extends PostWeatherLapseAbAttr {
  private healFactor: integer;

  constructor(healFactor: integer, ...weatherTypes: WeatherType[]) {
    super(...weatherTypes);

    this.healFactor = healFactor;
  }

  applyPostWeatherLapse(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: Weather, args: any[]): boolean {
    if (!pokemon.isFullHp()) {
      const scene = pokemon.scene;
      const abilityName = (!passive ? pokemon.getAbility() : pokemon.getPassiveAbility()).name;
      if (!simulated) {
        scene.unshiftPhase(new PokemonHealPhase(scene, pokemon.getBattlerIndex(),
          Utils.toDmgValue(pokemon.getMaxHp() / (16 / this.healFactor)), i18next.t("abilityTriggers:postWeatherLapseHeal", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName }), true));
      }
      return true;
    }

    return false;
  }
}

export class PostWeatherLapseDamageAbAttr extends PostWeatherLapseAbAttr {
  private damageFactor: integer;

  constructor(damageFactor: integer, ...weatherTypes: WeatherType[]) {
    super(...weatherTypes);

    this.damageFactor = damageFactor;
  }

  applyPostWeatherLapse(pokemon: Pokemon, passive: boolean, simulated: boolean, weather: Weather, args: any[]): boolean {
    const scene = pokemon.scene;
    if (pokemon.hasAbilityWithAttr(BlockNonDirectDamageAbAttr)) {
      return false;
    }

    if (!simulated) {
      const abilityName = (!passive ? pokemon.getAbility() : pokemon.getPassiveAbility()).name;
      scene.queueMessage(i18next.t("abilityTriggers:postWeatherLapseDamage", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName }));
      pokemon.damageAndUpdate(Utils.toDmgValue(pokemon.getMaxHp() / (16 / this.damageFactor)), HitResult.OTHER);
    }

    return true;
  }
}

export class PostTerrainChangeAbAttr extends AbAttr {
  applyPostTerrainChange(pokemon: Pokemon, passive: boolean, simulated: boolean, terrain: TerrainType, args: any[]): boolean {
    return false;
  }
}

export class PostTerrainChangeAddBattlerTagAttr extends PostTerrainChangeAbAttr {
  private tagType: BattlerTagType;
  private turnCount: integer;
  private terrainTypes: TerrainType[];

  constructor(tagType: BattlerTagType, turnCount: integer, ...terrainTypes: TerrainType[]) {
    super();

    this.tagType = tagType;
    this.turnCount = turnCount;
    this.terrainTypes = terrainTypes;
  }

  applyPostTerrainChange(pokemon: Pokemon, passive: boolean, simulated: boolean, terrain: TerrainType, args: any[]): boolean {
    if (!this.terrainTypes.find(t => t === terrain)) {
      return false;
    }

    if (simulated) {
      return pokemon.canAddTag(this.tagType);
    } else {
      return pokemon.addTag(this.tagType, this.turnCount);
    }
  }
}

function getTerrainCondition(...terrainTypes: TerrainType[]): AbAttrCondition {
  return (pokemon: Pokemon) => {
    const terrainType = pokemon.scene.arena.terrain?.terrainType;
    return !!terrainType && terrainTypes.indexOf(terrainType) > -1;
  };
}

export class PostTurnAbAttr extends AbAttr {
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * This attribute will heal 1/8th HP if the ability pokemon has the correct status.
 */
export class PostTurnStatusHealAbAttr extends PostTurnAbAttr {
  private effects: StatusEffect[];

  /**
   * @param {StatusEffect[]} effects The status effect(s) that will qualify healing the ability pokemon
   */
  constructor(...effects: StatusEffect[]) {
    super(false);

    this.effects = effects;
  }

  /**
   * @param {Pokemon} pokemon The pokemon with the ability that will receive the healing
   * @param {Boolean} passive N/A
   * @param {any[]} args N/A
   * @returns Returns true if healed from status, false if not
   */
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (pokemon.status && this.effects.includes(pokemon.status.effect)) {
      if (!pokemon.isFullHp()) {
        if (!simulated) {
          const scene = pokemon.scene;
          const abilityName = (!passive ? pokemon.getAbility() : pokemon.getPassiveAbility()).name;
          scene.unshiftPhase(new PokemonHealPhase(scene, pokemon.getBattlerIndex(),
            Utils.toDmgValue(pokemon.getMaxHp() / 8), i18next.t("abilityTriggers:poisonHeal", { pokemonName: getPokemonNameWithAffix(pokemon), abilityName }), true));
        }
        return true;
      }
    }
    return false;
  }
}

/**
 * After the turn ends, resets the status of either the ability holder or their ally
 * @param {boolean} allyTarget Whether to target ally, defaults to false (self-target)
 */
export class PostTurnResetStatusAbAttr extends PostTurnAbAttr {
  private allyTarget: boolean;
  private target: Pokemon;

  constructor(allyTarget: boolean = false) {
    super(true);
    this.allyTarget = allyTarget;
  }

  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (this.allyTarget) {
      this.target = pokemon.getAlly();
    } else {
      this.target = pokemon;
    }
    if (this.target?.status) {
      if (!simulated) {
        this.target.scene.queueMessage(getStatusEffectHealText(this.target.status?.effect, getPokemonNameWithAffix(this.target)));
        this.target.resetStatus(false);
        this.target.updateInfo();
      }

      return true;
    }

    return false;
  }
}

/**
 * After the turn ends, try to create an extra item
 */
export class PostTurnLootAbAttr extends PostTurnAbAttr {
  /**
   * @param itemType - The type of item to create
   * @param procChance - Chance to create an item
   * @see {@linkcode applyPostTurn()}
   */
  constructor(
    /** Extend itemType to add more options */
    private itemType: "EATEN_BERRIES" | "HELD_BERRIES",
    private procChance: (pokemon: Pokemon) => number
  ) {
    super();
  }

  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const pass = Phaser.Math.RND.realInRange(0, 1);
    // Clamp procChance to [0, 1]. Skip if didn't proc (less than pass)
    if (Math.max(Math.min(this.procChance(pokemon), 1), 0) < pass) {
      return false;
    }

    if (this.itemType === "EATEN_BERRIES") {
      return this.createEatenBerry(pokemon, simulated);
    } else {
      return false;
    }
  }

  /**
   * Create a new berry chosen randomly from the berries the pokemon ate this battle
   * @param pokemon The pokemon with this ability
   * @param simulated whether the associated ability call is simulated
   * @returns whether a new berry was created
   */
  createEatenBerry(pokemon: Pokemon, simulated: boolean): boolean {
    const berriesEaten = pokemon.battleData.berriesEaten;

    if (!berriesEaten.length) {
      return false;
    }

    if (simulated) {
      return true;
    }

    const randomIdx = Utils.randSeedInt(berriesEaten.length);
    const chosenBerryType = berriesEaten[randomIdx];
    const chosenBerry = new BerryModifierType(chosenBerryType);
    berriesEaten.splice(randomIdx); // Remove berry from memory

    const berryModifier = pokemon.scene.findModifier(
      (m) => m instanceof BerryModifier && m.berryType === chosenBerryType,
      pokemon.isPlayer()
    ) as BerryModifier | undefined;

    if (!berryModifier) {
      const newBerry = new BerryModifier(chosenBerry, pokemon.id, chosenBerryType, 1);
      if (pokemon.isPlayer()) {
        pokemon.scene.addModifier(newBerry);
      } else {
        pokemon.scene.addEnemyModifier(newBerry);
      }
    } else if (berryModifier.stackCount < berryModifier.getMaxHeldItemCount(pokemon)) {
      berryModifier.stackCount++;
    }

    pokemon.scene.queueMessage(i18next.t("abilityTriggers:postTurnLootCreateEatenBerry", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), berryName: chosenBerry.name }));
    pokemon.scene.updateModifiers(pokemon.isPlayer());

    return true;
  }
}

/**
 * Attribute used for {@linkcode Abilities.MOODY}
 */
export class MoodyAbAttr extends PostTurnAbAttr {
  constructor() {
    super(true);
  }
  /**
   * Randomly increases one stat stage by 2 and decreases a different stat stage by 1
   * @param {Pokemon} pokemon Pokemon that has this ability
   * @param passive N/A
   * @param simulated true if applying in a simulated call.
   * @param args N/A
   * @returns true
   *
   * Any stat stages at +6 or -6 are excluded from being increased or decreased, respectively
   * If the pokemon already has all stat stages raised to 6, it will only decrease one stat stage by 1
   * If the pokemon already has all stat stages lowered to -6, it will only increase one stat stage by 2
   */
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const canRaise = EFFECTIVE_STATS.filter(s => pokemon.getStatStage(s) < 6);
    let canLower = EFFECTIVE_STATS.filter(s => pokemon.getStatStage(s) > -6);

    if (!simulated) {
      if (canRaise.length > 0) {
        const raisedStat = canRaise[pokemon.randSeedInt(canRaise.length)];
        canLower = canRaise.filter(s => s !== raisedStat);
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ raisedStat ], 2));
      }
      if (canLower.length > 0) {
        const loweredStat = canLower[pokemon.randSeedInt(canLower.length)];
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ loweredStat ], -1));
      }
    }

    return true;
  }
}

export class SpeedBoostAbAttr extends PostTurnAbAttr {

  constructor() {
    super(true);
  }

  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!simulated) {
      if (!pokemon.turnData.switchedInThisTurn && !pokemon.turnData.failedRunAway) {
        pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, [ Stat.SPD ], 1));
      } else {
        return false;
      }
    }
    return true;
  }
}

export class PostTurnHealAbAttr extends PostTurnAbAttr {
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!pokemon.isFullHp()) {
      if (!simulated) {
        const scene = pokemon.scene;
        const abilityName = (!passive ? pokemon.getAbility() : pokemon.getPassiveAbility()).name;
        scene.unshiftPhase(new PokemonHealPhase(scene, pokemon.getBattlerIndex(),
          Utils.toDmgValue(pokemon.getMaxHp() / 16), i18next.t("abilityTriggers:postTurnHeal", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName }), true));
      }

      return true;
    }

    return false;
  }
}

export class PostTurnFormChangeAbAttr extends PostTurnAbAttr {
  private formFunc: (p: Pokemon) => integer;

  constructor(formFunc: ((p: Pokemon) => integer)) {
    super(true);

    this.formFunc = formFunc;
  }

  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const formIndex = this.formFunc(pokemon);
    if (formIndex !== pokemon.formIndex) {
      if (!simulated) {
        pokemon.scene.triggerPokemonFormChange(pokemon, SpeciesFormChangeManualTrigger, false);
      }

      return true;
    }

    return false;
  }
}


/**
 * Attribute used for abilities (Bad Dreams) that damages the opponents for being asleep
 */
export class PostTurnHurtIfSleepingAbAttr extends PostTurnAbAttr {

  /**
   * Deals damage to all sleeping opponents equal to 1/8 of their max hp (min 1)
   * @param pokemon Pokemon that has this ability
   * @param passive N/A
   * @param simulated `true` if applying in a simulated call.
   * @param args N/A
   * @returns `true` if any opponents are sleeping
   */
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    let hadEffect: boolean = false;
    for (const opp of pokemon.getOpponents()) {
      if ((opp.status?.effect === StatusEffect.SLEEP || opp.hasAbility(Abilities.COMATOSE)) && !opp.hasAbilityWithAttr(BlockNonDirectDamageAbAttr) && !opp.switchOutStatus) {
        if (!simulated) {
          opp.damageAndUpdate(Utils.toDmgValue(opp.getMaxHp() / 8), HitResult.OTHER);
          pokemon.scene.queueMessage(i18next.t("abilityTriggers:badDreams", { pokemonName: getPokemonNameWithAffix(opp) }));
        }
        hadEffect = true;
      }

    }
    return hadEffect;
  }
}


/**
 * Grabs the last failed Pokeball used
 * @extends PostTurnAbAttr
 * @see {@linkcode applyPostTurn} */
export class FetchBallAbAttr extends PostTurnAbAttr {
  constructor() {
    super();
  }
  /**
   * Adds the last used Pokeball back into the player's inventory
   * @param pokemon {@linkcode Pokemon} with this ability
   * @param passive N/A
   * @param args N/A
   * @returns true if player has used a pokeball and this pokemon is owned by the player
   */
  applyPostTurn(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (simulated) {
      return false;
    }
    const lastUsed = pokemon.scene.currentBattle.lastUsedPokeball;
    if (lastUsed !== null && !!pokemon.isPlayer) {
      pokemon.scene.pokeballCounts[lastUsed]++;
      pokemon.scene.currentBattle.lastUsedPokeball = null;
      pokemon.scene.queueMessage(i18next.t("abilityTriggers:fetchBall", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), pokeballName: getPokeballName(lastUsed) }));
      return true;
    }
    return false;
  }
}

export class PostBiomeChangeAbAttr extends AbAttr { }

export class PostBiomeChangeWeatherChangeAbAttr extends PostBiomeChangeAbAttr {
  private weatherType: WeatherType;

  constructor(weatherType: WeatherType) {
    super();

    this.weatherType = weatherType;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!pokemon.scene.arena.weather?.isImmutable()) {
      if (simulated) {
        return pokemon.scene.arena.weather?.weatherType !== this.weatherType;
      } else {
        return pokemon.scene.arena.trySetWeather(this.weatherType, true);
      }
    }

    return false;
  }
}

export class PostBiomeChangeTerrainChangeAbAttr extends PostBiomeChangeAbAttr {
  private terrainType: TerrainType;

  constructor(terrainType: TerrainType) {
    super();

    this.terrainType = terrainType;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (simulated) {
      return pokemon.scene.arena.terrain?.terrainType !== this.terrainType;
    } else {
      return pokemon.scene.arena.trySetTerrain(this.terrainType, true);
    }
  }
}

/**
 * Triggers just after a move is used either by the opponent or the player
 * @extends AbAttr
 */
export class PostMoveUsedAbAttr extends AbAttr {
  applyPostMoveUsed(pokemon: Pokemon, move: PokemonMove, source: Pokemon, targets: BattlerIndex[], simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Triggers after a dance move is used either by the opponent or the player
 * @extends PostMoveUsedAbAttr
 */
export class PostDancingMoveAbAttr extends PostMoveUsedAbAttr {
  /**
   * Resolves the Dancer ability by replicating the move used by the source of the dance
   * either on the source itself or on the target of the dance
   * @param dancer {@linkcode Pokemon} with Dancer ability
   * @param move {@linkcode PokemonMove} Dancing move used by the source
   * @param source {@linkcode Pokemon} that used the dancing move
   * @param targets {@linkcode BattlerIndex}Targets of the dancing move
   * @param args N/A
   *
   * @return true if the Dancer ability was resolved
   */
  applyPostMoveUsed(dancer: Pokemon, move: PokemonMove, source: Pokemon, targets: BattlerIndex[], simulated: boolean, args: any[]): boolean | Promise<boolean> {
    // List of tags that prevent the Dancer from replicating the move
    const forbiddenTags = [ BattlerTagType.FLYING, BattlerTagType.UNDERWATER,
      BattlerTagType.UNDERGROUND, BattlerTagType.HIDDEN ];
    // The move to replicate cannot come from the Dancer
    if (source.getBattlerIndex() !== dancer.getBattlerIndex()
        && !dancer.summonData.tags.some(tag => forbiddenTags.includes(tag.tagType))) {
      if (!simulated) {
        // If the move is an AttackMove or a StatusMove the Dancer must replicate the move on the source of the Dance
        if (move.getMove() instanceof AttackMove || move.getMove() instanceof StatusMove) {
          const target = this.getTarget(dancer, source, targets);
          dancer.scene.unshiftPhase(new MovePhase(dancer.scene, dancer, target, move, true, true));
        } else if (move.getMove() instanceof SelfStatusMove) {
          // If the move is a SelfStatusMove (ie. Swords Dance) the Dancer should replicate it on itself
          dancer.scene.unshiftPhase(new MovePhase(dancer.scene, dancer, [ dancer.getBattlerIndex() ], move, true, true));
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Get the correct targets of Dancer ability
   *
   * @param dancer {@linkcode Pokemon} Pokemon with Dancer ability
   * @param source {@linkcode Pokemon} Source of the dancing move
   * @param targets {@linkcode BattlerIndex} Targets of the dancing move
   */
  getTarget(dancer: Pokemon, source: Pokemon, targets: BattlerIndex[]) : BattlerIndex[] {
    if (dancer.isPlayer()) {
      return source.isPlayer() ? targets : [ source.getBattlerIndex() ];
    }
    return source.isPlayer() ? [ source.getBattlerIndex() ] : targets;
  }
}

/**
 * Triggers after the Pokemon loses or consumes an item
 * @extends AbAttr
 */
export class PostItemLostAbAttr extends AbAttr {
  applyPostItemLost(pokemon: Pokemon, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Applies a Battler Tag to the Pokemon after it loses or consumes item
 * @extends PostItemLostAbAttr
 */
export class PostItemLostApplyBattlerTagAbAttr extends PostItemLostAbAttr {
  private tagType: BattlerTagType;
  constructor(tagType: BattlerTagType) {
    super(true);
    this.tagType = tagType;
  }
  /**
   * Adds the last used Pokeball back into the player's inventory
   * @param pokemon {@linkcode Pokemon} with this ability
   * @param args N/A
   * @returns true if BattlerTag was applied
   */
  applyPostItemLost(pokemon: Pokemon, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (!pokemon.getTag(this.tagType) && !simulated) {
      pokemon.addTag(this.tagType);
      return true;
    }
    return false;
  }
}

export class StatStageChangeMultiplierAbAttr extends AbAttr {
  private multiplier: integer;

  constructor(multiplier: integer) {
    super(true);

    this.multiplier = multiplier;
  }

  override apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.IntegerHolder).value *= this.multiplier;

    return true;
  }
}

export class StatStageChangeCopyAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean | Promise<boolean> {
    if (!simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, (args[0] as BattleStat[]), (args[1] as number), true, false, false));
    }
    return true;
  }
}

export class BypassBurnDamageReductionAbAttr extends AbAttr {
  constructor() {
    super(false);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;

    return true;
  }
}

/**
 * Causes Pokemon to take reduced damage from the {@linkcode StatusEffect.BURN | Burn} status
 * @param multiplier Multiplied with the damage taken
*/
export class ReduceBurnDamageAbAttr extends AbAttr {
  constructor(protected multiplier: number) {
    super(false);
  }

  /**
   * Applies the damage reduction
   * @param pokemon N/A
   * @param passive N/A
   * @param cancelled N/A
   * @param args `[0]` {@linkcode Utils.NumberHolder} The damage value being modified
   * @returns `true`
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.NumberHolder).value = Utils.toDmgValue((args[0] as Utils.NumberHolder).value * this.multiplier);

    return true;
  }
}

export class DoubleBerryEffectAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.NumberHolder).value *= 2;

    return true;
  }
}

export class PreventBerryUseAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;

    return true;
  }
}

/**
 * A Pokemon with this ability heals by a percentage of their maximum hp after eating a berry
 * @param healPercent - Percent of Max HP to heal
 * @see {@linkcode apply()} for implementation
 */
export class HealFromBerryUseAbAttr extends AbAttr {
  /** Percent of Max HP to heal */
  private healPercent: number;

  constructor(healPercent: number) {
    super();

    // Clamp healPercent so its between [0,1].
    this.healPercent = Math.max(Math.min(healPercent, 1), 0);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, ...args: [Utils.BooleanHolder, any[]]): boolean {
    const { name: abilityName } = passive ? pokemon.getPassiveAbility() : pokemon.getAbility();
    if (!simulated) {
      pokemon.scene.unshiftPhase(
        new PokemonHealPhase(
          pokemon.scene,
          pokemon.getBattlerIndex(),
          Utils.toDmgValue(pokemon.getMaxHp() * this.healPercent),
          i18next.t("abilityTriggers:healFromBerryUse", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName }),
          true
        )
      );
    }
    return true;
  }
}

export class RunSuccessAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.IntegerHolder).value = 256;

    return true;
  }
}

type ArenaTrapCondition = (user: Pokemon, target: Pokemon) => boolean;

/**
 * Base class for checking if a Pokemon is trapped by arena trap
 * @extends AbAttr
 * @field {@linkcode arenaTrapCondition} Conditional for trapping abilities.
 * For example, Magnet Pull will only activate if opponent is Steel type.
 * @see {@linkcode applyCheckTrapped}
 */
export class CheckTrappedAbAttr extends AbAttr {
  protected arenaTrapCondition: ArenaTrapCondition;
  constructor(condition: ArenaTrapCondition) {
    super(false);
    this.arenaTrapCondition = condition;
  }

  applyCheckTrapped(pokemon: Pokemon, passive: boolean, simulated: boolean, trapped: Utils.BooleanHolder, otherPokemon: Pokemon, args: any[]): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Determines whether a Pokemon is blocked from switching/running away
 * because of a trapping ability or move.
 * @extends CheckTrappedAbAttr
 * @see {@linkcode applyCheckTrapped}
 */
export class ArenaTrapAbAttr extends CheckTrappedAbAttr {
  /**
   * Checks if enemy Pokemon is trapped by an Arena Trap-esque ability
   * If the enemy is a Ghost type, it is not trapped
   * If the enemy has the ability Run Away, it is not trapped.
   * If the user has Magnet Pull and the enemy is not a Steel type, it is not trapped.
   * If the user has Arena Trap and the enemy is not grounded, it is not trapped.
   * @param pokemon The {@link Pokemon} with this {@link AbAttr}
   * @param passive N/A
   * @param trapped {@link Utils.BooleanHolder} indicating whether the other Pokemon is trapped or not
   * @param otherPokemon The {@link Pokemon} that is affected by an Arena Trap ability
   * @param args N/A
   * @returns if enemy Pokemon is trapped or not
   */
  applyCheckTrapped(pokemon: Pokemon, passive: boolean, simulated: boolean, trapped: Utils.BooleanHolder, otherPokemon: Pokemon, args: any[]): boolean {
    if (this.arenaTrapCondition(pokemon, otherPokemon)) {
      if (otherPokemon.getTypes(true).includes(Type.GHOST) || (otherPokemon.getTypes(true).includes(Type.STELLAR) && otherPokemon.getTypes().includes(Type.GHOST))) {
        trapped.value = false;
        return false;
      } else if (otherPokemon.hasAbility(Abilities.RUN_AWAY)) {
        trapped.value = false;
        return false;
      }
      trapped.value = true;
      return true;
    }
    trapped.value = false;
    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:arenaTrap", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName });
  }
}

export class MaxMultiHitAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.IntegerHolder).value = 0;

    return true;
  }
}

export class PostBattleAbAttr extends AbAttr {
  constructor() {
    super(true);
  }

  applyPostBattle(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    return false;
  }
}

export class PostBattleLootAbAttr extends PostBattleAbAttr {
  /**
   * @param args - `[0]`: boolean for if the battle ended in a victory
   * @returns `true` if successful
   */
  applyPostBattle(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const postBattleLoot = pokemon.scene.currentBattle.postBattleLoot;
    if (!simulated && postBattleLoot.length && args[0]) {
      const randItem = Utils.randSeedItem(postBattleLoot);
      //@ts-ignore - TODO see below
      if (pokemon.scene.tryTransferHeldItemModifier(randItem, pokemon, true, 1, true, undefined, false)) { // TODO: fix. This is a promise!?
        postBattleLoot.splice(postBattleLoot.indexOf(randItem), 1);
        pokemon.scene.queueMessage(i18next.t("abilityTriggers:postBattleLoot", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), itemName: randItem.type.name }));
        return true;
      }
    }

    return false;
  }
}

export class PostFaintAbAttr extends AbAttr {
  applyPostFaint(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker?: Pokemon, move?: Move, hitResult?: HitResult, ...args: any[]): boolean {
    return false;
  }
}

/**
 * Used for weather suppressing abilities to trigger weather-based form changes upon being fainted.
 * Used by Cloud Nine and Air Lock.
 * @extends PostFaintAbAttr
 */
export class PostFaintUnsuppressedWeatherFormChangeAbAttr extends PostFaintAbAttr {
  /**
   * Triggers {@linkcode Arena.triggerWeatherBasedFormChanges | triggerWeatherBasedFormChanges}
   * when the user of the ability faints
   * @param {Pokemon} pokemon the fainted Pokemon
   * @param passive n/a
   * @param attacker n/a
   * @param move n/a
   * @param hitResult n/a
   * @param args n/a
   * @returns whether the form change was triggered
   */
  applyPostFaint(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, hitResult: HitResult, args: any[]): boolean {
    const pokemonToTransform = getPokemonWithWeatherBasedForms(pokemon.scene);

    if (pokemonToTransform.length < 1) {
      return false;
    }

    if (!simulated) {
      pokemon.scene.arena.triggerWeatherBasedFormChanges();
    }

    return true;
  }
}

/**
 * Clears Desolate Land/Primordial Sea/Delta Stream upon the Pokemon fainting
 */
export class PostFaintClearWeatherAbAttr extends PostFaintAbAttr {

  /**
   * @param pokemon The {@linkcode Pokemon} with the ability
   * @param passive N/A
   * @param attacker N/A
   * @param move N/A
   * @param hitResult N/A
   * @param args N/A
   * @returns {boolean} Returns true if the weather clears, otherwise false.
   */
  applyPostFaint(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker?: Pokemon, move?: Move, hitResult?: HitResult, ...args: any[]): boolean {
    const weatherType = pokemon.scene.arena.weather?.weatherType;
    let turnOffWeather = false;

    // Clear weather only if user's ability matches the weather and no other pokemon has the ability.
    switch (weatherType) {
      case (WeatherType.HARSH_SUN):
        if (pokemon.hasAbility(Abilities.DESOLATE_LAND)
          && pokemon.scene.getField(true).filter(p => p.hasAbility(Abilities.DESOLATE_LAND)).length === 0) {
          turnOffWeather = true;
        }
        break;
      case (WeatherType.HEAVY_RAIN):
        if (pokemon.hasAbility(Abilities.PRIMORDIAL_SEA)
          && pokemon.scene.getField(true).filter(p => p.hasAbility(Abilities.PRIMORDIAL_SEA)).length === 0) {
          turnOffWeather = true;
        }
        break;
      case (WeatherType.STRONG_WINDS):
        if (pokemon.hasAbility(Abilities.DELTA_STREAM)
          && pokemon.scene.getField(true).filter(p => p.hasAbility(Abilities.DELTA_STREAM)).length === 0) {
          turnOffWeather = true;
        }
        break;
    }

    if (simulated) {
      return turnOffWeather;
    }

    if (turnOffWeather) {
      pokemon.scene.arena.trySetWeather(WeatherType.NONE, false);
      return true;
    }

    return false;
  }
}

export class PostFaintContactDamageAbAttr extends PostFaintAbAttr {
  private damageRatio: integer;

  constructor(damageRatio: integer) {
    super();

    this.damageRatio = damageRatio;
  }

  applyPostFaint(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker?: Pokemon, move?: Move, hitResult?: HitResult, ...args: any[]): boolean {
    if (move !== undefined && attacker !== undefined && move.checkFlag(MoveFlags.MAKES_CONTACT, attacker, pokemon)) {  //If the mon didn't die to indirect damage
      const cancelled = new Utils.BooleanHolder(false);
      pokemon.scene.getField(true).map(p => applyAbAttrs(FieldPreventExplosiveMovesAbAttr, p, cancelled, simulated));
      if (cancelled.value || attacker.hasAbilityWithAttr(BlockNonDirectDamageAbAttr)) {
        return false;
      }
      if (!simulated) {
        attacker.damageAndUpdate(Utils.toDmgValue(attacker.getMaxHp() * (1 / this.damageRatio)), HitResult.OTHER);
        attacker.turnData.damageTaken += Utils.toDmgValue(attacker.getMaxHp() * (1 / this.damageRatio));
      }
      return true;
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:postFaintContactDamage", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName });
  }
}

/**
 * Attribute used for abilities (Innards Out) that damage the opponent based on how much HP the last attack used to knock out the owner of the ability.
 */
export class PostFaintHPDamageAbAttr extends PostFaintAbAttr {
  constructor() {
    super ();
  }

  applyPostFaint(pokemon: Pokemon, passive: boolean, simulated: boolean, attacker?: Pokemon, move?: Move, hitResult?: HitResult, ...args: any[]): boolean {
    if (move !== undefined && attacker !== undefined && !simulated) { //If the mon didn't die to indirect damage
      const damage = pokemon.turnData.attacksReceived[0].damage;
      attacker.damageAndUpdate((damage), HitResult.OTHER);
      attacker.turnData.damageTaken += damage;
    }
    return true;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:postFaintHpDamage", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName });
  }
}

export class RedirectMoveAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.canRedirect(args[0] as Moves)) {
      const target = args[1] as Utils.IntegerHolder;
      const newTarget = pokemon.getBattlerIndex();
      if (target.value !== newTarget) {
        target.value = newTarget;
        return true;
      }
    }

    return false;
  }

  canRedirect(moveId: Moves): boolean {
    const move = allMoves[moveId];
    return !![ MoveTarget.NEAR_OTHER, MoveTarget.OTHER ].find(t => move.moveTarget === t);
  }
}

export class RedirectTypeMoveAbAttr extends RedirectMoveAbAttr {
  public type: Type;

  constructor(type: Type) {
    super();
    this.type = type;
  }

  canRedirect(moveId: Moves): boolean {
    return super.canRedirect(moveId) && allMoves[moveId].type === this.type;
  }
}

export class BlockRedirectAbAttr extends AbAttr { }

/**
 * Used by Early Bird, makes the pokemon wake up faster
 * @param statusEffect - The {@linkcode StatusEffect} to check for
 * @see {@linkcode apply}
 */
export class ReduceStatusEffectDurationAbAttr extends AbAttr {
  private statusEffect: StatusEffect;

  constructor(statusEffect: StatusEffect) {
    super(true);

    this.statusEffect = statusEffect;
  }

  /**
   * Reduces the number of sleep turns remaining by an extra 1 when applied
   * @param args - The args passed to the `AbAttr`:
   * - `[0]` - The {@linkcode StatusEffect} of the Pokemon
   * - `[1]` - The number of turns remaining until the status is healed
   * @returns `true` if the ability was applied
   */
  apply(_pokemon: Pokemon, _passive: boolean, _simulated: boolean, _cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!(args[1] instanceof Utils.NumberHolder)) {
      return false;
    }
    if (args[0] === this.statusEffect) {
      args[1].value -= 1;
      return true;
    }

    return false;
  }
}

export class FlinchEffectAbAttr extends AbAttr {
  constructor() {
    super(true);
  }
}

export class FlinchStatStageChangeAbAttr extends FlinchEffectAbAttr {
  private stats: BattleStat[];
  private stages: number;

  constructor(stats: BattleStat[], stages: number) {
    super();

    this.stats = Array.isArray(stats)
      ? stats
      : [ stats ];
    this.stages = stages;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (!simulated) {
      pokemon.scene.unshiftPhase(new StatStageChangePhase(pokemon.scene, pokemon.getBattlerIndex(), true, this.stats, this.stages));
    }
    return true;
  }
}

export class IncreasePpAbAttr extends AbAttr { }

export class ForceSwitchOutImmunityAbAttr extends AbAttr {
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    cancelled.value = true;
    return true;
  }
}

export class ReduceBerryUseThresholdAbAttr extends AbAttr {
  constructor() {
    super();
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const hpRatio = pokemon.getHpRatio();

    if (args[0].value < hpRatio) {
      args[0].value *= 2;
      return args[0].value >= hpRatio;
    }

    return false;
  }
}

/**
 * Ability attribute used for abilites that change the ability owner's weight
 * Used for Heavy Metal (doubling weight) and Light Metal (halving weight)
 */
export class WeightMultiplierAbAttr extends AbAttr {
  private multiplier: integer;

  constructor(multiplier: integer) {
    super();

    this.multiplier = multiplier;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Utils.NumberHolder).value *= this.multiplier;

    return true;
  }
}

export class SyncEncounterNatureAbAttr extends AbAttr {
  constructor() {
    super(false);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    (args[0] as Pokemon).setNature(pokemon.getNature());

    return true;
  }
}

export class MoveAbilityBypassAbAttr extends AbAttr {
  private moveIgnoreFunc: (pokemon: Pokemon, move: Move) => boolean;

  constructor(moveIgnoreFunc?: (pokemon: Pokemon, move: Move) => boolean) {
    super(false);

    this.moveIgnoreFunc = moveIgnoreFunc || ((pokemon, move) => true);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.moveIgnoreFunc(pokemon, (args[0] as Move))) {
      cancelled.value = true;
      return true;
    }
    return false;
  }
}

export class SuppressFieldAbilitiesAbAttr extends AbAttr {
  constructor() {
    super(false);
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const ability = (args[0] as Ability);
    if (!ability.hasAttr(UnsuppressableAbilityAbAttr) && !ability.hasAttr(SuppressFieldAbilitiesAbAttr)) {
      cancelled.value = true;
      return true;
    }
    return false;
  }
}

export class AlwaysHitAbAttr extends AbAttr { }

/** Attribute for abilities that allow moves that make contact to ignore protection (i.e. Unseen Fist) */
export class IgnoreProtectOnContactAbAttr extends AbAttr { }

/**
 * Attribute implementing the effects of {@link https://bulbapedia.bulbagarden.net/wiki/Infiltrator_(Ability) | Infiltrator}.
 * Allows the source's moves to bypass the effects of opposing Light Screen, Reflect, Aurora Veil, Safeguard, Mist, and Substitute.
 */
export class InfiltratorAbAttr extends AbAttr {
  /**
   * Sets a flag to bypass screens, Substitute, Safeguard, and Mist
   * @param pokemon n/a
   * @param passive n/a
   * @param simulated n/a
   * @param cancelled n/a
   * @param args `[0]` a {@linkcode Utils.BooleanHolder | BooleanHolder} containing the flag
   * @returns `true` if the bypass flag was successfully set; `false` otherwise.
   */
  override apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: null, args: any[]): boolean {
    const bypassed = args[0];
    if (args[0] instanceof Utils.BooleanHolder) {
      bypassed.value = true;
      return true;
    }
    return false;
  }
}

export class UncopiableAbilityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }
}

export class UnsuppressableAbilityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }
}

export class UnswappableAbilityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }
}

export class NoTransformAbilityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }
}

export class NoFusionAbilityAbAttr extends AbAttr {
  constructor() {
    super(false);
  }
}

export class IgnoreTypeImmunityAbAttr extends AbAttr {
  private defenderType: Type;
  private allowedMoveTypes: Type[];

  constructor(defenderType: Type, allowedMoveTypes: Type[]) {
    super(true);
    this.defenderType = defenderType;
    this.allowedMoveTypes = allowedMoveTypes;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.defenderType === (args[1] as Type) && this.allowedMoveTypes.includes(args[0] as Type)) {
      cancelled.value = true;
      return true;
    }
    return false;
  }
}

/**
 * Ignores the type immunity to Status Effects of the defender if the defender is of a certain type
 */
export class IgnoreTypeStatusEffectImmunityAbAttr extends AbAttr {
  private statusEffect: StatusEffect[];
  private defenderType: Type[];

  constructor(statusEffect: StatusEffect[], defenderType: Type[]) {
    super(true);

    this.statusEffect = statusEffect;
    this.defenderType = defenderType;
  }

  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.statusEffect.includes(args[0] as StatusEffect) && this.defenderType.includes(args[1] as Type)) {
      cancelled.value = true;
      return true;
    }

    return false;
  }
}

/**
 * Gives money to the user after the battle.
 *
 * @extends PostBattleAbAttr
 * @see {@linkcode applyPostBattle}
 */
export class MoneyAbAttr extends PostBattleAbAttr {
  constructor() {
    super();
  }

  /**
   * @param pokemon {@linkcode Pokemon} that is the user of this ability.
   * @param passive N/A
   * @param args - `[0]`: boolean for if the battle ended in a victory
   * @returns `true` if successful
   */
  applyPostBattle(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    if (!simulated && args[0]) {
      pokemon.scene.currentBattle.moneyScattered += pokemon.scene.getWaveMoneyAmount(0.2);
      return true;
    }
    return false;
  }
}

/**
 * Applies a stat change after a Pokémon is summoned,
 * conditioned on the presence of a specific arena tag.
 *
 * @extends PostSummonStatStageChangeAbAttr
 */
export class PostSummonStatStageChangeOnArenaAbAttr extends PostSummonStatStageChangeAbAttr {
  /**
   * The type of arena tag that conditions the stat change.
   * @private
   */
  private tagType: ArenaTagType;

  /**
   * Creates an instance of PostSummonStatStageChangeOnArenaAbAttr.
   * Initializes the stat change to increase Attack by 1 stage if the specified arena tag is present.
   *
   * @param {ArenaTagType} tagType - The type of arena tag to check for.
   */
  constructor(tagType: ArenaTagType) {
    super([ Stat.ATK ], 1, true, false);
    this.tagType = tagType;
  }

  /**
   * Applies the post-summon stat change if the specified arena tag is present on pokemon's side.
   * This is used in Wind Rider ability.
   *
   * @param {Pokemon} pokemon - The Pokémon being summoned.
   * @param {boolean} passive - Whether the effect is passive.
   * @param {any[]} args - Additional arguments.
   * @returns {boolean} - Returns true if the stat change was applied, otherwise false.
   */
  applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean {
    const side = pokemon.isPlayer() ? ArenaTagSide.PLAYER : ArenaTagSide.ENEMY;

    if (pokemon.scene.arena.getTagOnSide(this.tagType, side)) {
      return super.applyPostSummon(pokemon, passive, simulated, args);
    }
    return false;
  }
}

/**
 * Takes no damage from the first hit of a damaging move.
 * This is used in the Disguise and Ice Face abilities.
 * @extends ReceivedMoveDamageMultiplierAbAttr
 */
export class FormBlockDamageAbAttr extends ReceivedMoveDamageMultiplierAbAttr {
  private multiplier: number;
  private tagType: BattlerTagType;
  private recoilDamageFunc?: ((pokemon: Pokemon) => number);
  private triggerMessageFunc: (pokemon: Pokemon, abilityName: string) => string;

  constructor(condition: PokemonDefendCondition, multiplier: number, tagType: BattlerTagType, triggerMessageFunc: (pokemon: Pokemon, abilityName: string) => string, recoilDamageFunc?: (pokemon: Pokemon) => number) {
    super(condition, multiplier);

    this.multiplier = multiplier;
    this.tagType = tagType;
    this.recoilDamageFunc = recoilDamageFunc;
    this.triggerMessageFunc = triggerMessageFunc;
  }

  /**
   * Applies the pre-defense ability to the Pokémon.
   * Removes the appropriate `BattlerTagType` when hit by an attack and is in its defense form.
   *
   * @param pokemon The Pokémon with the ability.
   * @param _passive n/a
   * @param attacker The attacking Pokémon.
   * @param move The move being used.
   * @param _cancelled n/a
   * @param args Additional arguments.
   * @returns `true` if the immunity was applied.
   */
  override applyPreDefend(pokemon: Pokemon, _passive: boolean, simulated: boolean, attacker: Pokemon, move: Move, _cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (this.condition(pokemon, attacker, move) && !move.hitsSubstitute(attacker, pokemon)) {
      if (!simulated) {
        (args[0] as Utils.NumberHolder).value = this.multiplier;
        pokemon.removeTag(this.tagType);
        if (this.recoilDamageFunc) {
          pokemon.damageAndUpdate(this.recoilDamageFunc(pokemon), HitResult.OTHER, false, false, true, true);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Gets the message triggered when the Pokémon avoids damage using the form-changing ability.
   * @param pokemon The Pokémon with the ability.
   * @param abilityName The name of the ability.
   * @param _args n/a
   * @returns The trigger message.
   */
  getTriggerMessage(pokemon: Pokemon, abilityName: string, ..._args: any[]): string {
    return this.triggerMessageFunc(pokemon, abilityName);
  }
}

/**
 * If a Pokémon with this Ability selects a damaging move, it has a 30% chance of going first in its priority bracket. If the Ability activates, this is announced at the start of the turn (after move selection).
 *
 * @extends AbAttr
 */
export class BypassSpeedChanceAbAttr extends AbAttr {
  public chance: integer;

  /**
   * @param {integer} chance probability of ability being active.
   */
  constructor(chance: integer) {
    super(true);
    this.chance = chance;
  }

  /**
   * bypass move order in their priority bracket when pokemon choose damaging move
   * @param {Pokemon} pokemon {@linkcode Pokemon}  the Pokemon applying this ability
   * @param {boolean} passive N/A
   * @param {Utils.BooleanHolder} cancelled N/A
   * @param {any[]} args [0] {@linkcode Utils.BooleanHolder} set to true when the ability activated
   * @returns {boolean} - whether the ability was activated.
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    if (simulated) {
      return false;
    }
    const bypassSpeed = args[0] as Utils.BooleanHolder;

    if (!bypassSpeed.value && pokemon.randSeedInt(100) < this.chance) {
      const turnCommand =
        pokemon.scene.currentBattle.turnCommands[pokemon.getBattlerIndex()];
      const isCommandFight = turnCommand?.command === Command.FIGHT;
      const move = turnCommand?.move?.move ? allMoves[turnCommand.move.move] : null;
      const isDamageMove = move?.category === MoveCategory.PHYSICAL || move?.category === MoveCategory.SPECIAL;

      if (isCommandFight && isDamageMove) {
        bypassSpeed.value = true;
        return true;
      }
    }

    return false;
  }

  getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]): string {
    return i18next.t("abilityTriggers:quickDraw", { pokemonName: getPokemonNameWithAffix(pokemon) });
  }
}

/**
 * This attribute checks if a Pokemon's move meets a provided condition to determine if the Pokemon can use Quick Claw
 * It was created because Pokemon with the ability Mycelium Might cannot access Quick Claw's benefits when using status moves.
*/
export class PreventBypassSpeedChanceAbAttr extends AbAttr {
  private condition: ((pokemon: Pokemon, move: Move) => boolean);

  /**
   * @param {function} condition - checks if a move meets certain conditions
   */
  constructor(condition: (pokemon: Pokemon, move: Move) => boolean) {
    super(true);
    this.condition = condition;
  }

  /**
   * @argument {boolean} bypassSpeed - determines if a Pokemon is able to bypass speed at the moment
   * @argument {boolean} canCheckHeldItems - determines if a Pokemon has access to Quick Claw's effects or not
   */
  apply(pokemon: Pokemon, passive: boolean, simulated: boolean, cancelled: Utils.BooleanHolder, args: any[]): boolean {
    const bypassSpeed = args[0] as Utils.BooleanHolder;
    const canCheckHeldItems = args[1] as Utils.BooleanHolder;

    const turnCommand = pokemon.scene.currentBattle.turnCommands[pokemon.getBattlerIndex()];
    const isCommandFight = turnCommand?.command === Command.FIGHT;
    const move = turnCommand?.move?.move ? allMoves[turnCommand.move.move] : null;
    if (this.condition(pokemon, move!) && isCommandFight) {
      bypassSpeed.value = false;
      canCheckHeldItems.value = false;
      return false;
    }
    return true;
  }
}

/**
 * This applies a terrain-based type change to the Pokemon.
 * Used by Mimicry.
 */
export class TerrainEventTypeChangeAbAttr extends PostSummonAbAttr {
  constructor() {
    super(true);
  }

  override apply(pokemon: Pokemon, _passive: boolean, _simulated: boolean, _cancelled: Utils.BooleanHolder, _args: any[]): boolean {
    if (pokemon.isTerastallized()) {
      return false;
    }
    const currentTerrain = pokemon.scene.arena.getTerrainType();
    const typeChange: Type[] = this.determineTypeChange(pokemon, currentTerrain);
    if (typeChange.length !== 0) {
      if (pokemon.summonData.addedType && typeChange.includes(pokemon.summonData.addedType)) {
        pokemon.summonData.addedType = null;
      }
      pokemon.summonData.types = typeChange;
      pokemon.updateInfo();
    }
    return true;
  }

  /**
   * Retrieves the type(s) the Pokemon should change to in response to a terrain
   * @param pokemon
   * @param currentTerrain {@linkcode TerrainType}
   * @returns a list of type(s)
   */
  private determineTypeChange(pokemon: Pokemon, currentTerrain: TerrainType): Type[] {
    const typeChange: Type[] = [];
    switch (currentTerrain) {
      case TerrainType.ELECTRIC:
        typeChange.push(Type.ELECTRIC);
        break;
      case TerrainType.MISTY:
        typeChange.push(Type.FAIRY);
        break;
      case TerrainType.GRASSY:
        typeChange.push(Type.GRASS);
        break;
      case TerrainType.PSYCHIC:
        typeChange.push(Type.PSYCHIC);
        break;
      default:
        pokemon.getTypes(false, false, true).forEach(t => {
          typeChange.push(t);
        });
        break;
    }
    return typeChange;
  }

  /**
   * Checks if the Pokemon should change types if summoned into an active terrain
   * @returns `true` if there is an active terrain requiring a type change | `false` if not
   */
  override applyPostSummon(pokemon: Pokemon, passive: boolean, simulated: boolean, args: any[]): boolean | Promise<boolean> {
    if (pokemon.scene.arena.getTerrainType() !== TerrainType.NONE) {
      return this.apply(pokemon, passive, simulated, new Utils.BooleanHolder(false), []);
    }
    return false;
  }

  override getTriggerMessage(pokemon: Pokemon, abilityName: string, ...args: any[]) {
    const currentTerrain = pokemon.scene.arena.getTerrainType();
    const pokemonNameWithAffix = getPokemonNameWithAffix(pokemon);
    if (currentTerrain === TerrainType.NONE) {
      return i18next.t("abilityTriggers:pokemonTypeChangeRevert", { pokemonNameWithAffix });
    } else {
      const moveType = i18next.t(`pokemonInfo:Type.${Type[this.determineTypeChange(pokemon, currentTerrain)[0]]}`);
      return i18next.t("abilityTriggers:pokemonTypeChange", { pokemonNameWithAffix, moveType });
    }
  }
}

async function applyAbAttrsInternal<TAttr extends AbAttr>(
  attrType: Constructor<TAttr>,
  pokemon: Pokemon | null,
  applyFunc: AbAttrApplyFunc<TAttr>,
  args: any[],
  showAbilityInstant: boolean = false,
  simulated: boolean = false,
  messages: string[] = [],
) {
  for (const passive of [ false, true ]) {
    if (!pokemon?.canApplyAbility(passive) || (passive && pokemon.getPassiveAbility().id === pokemon.getAbility().id)) {
      continue;
    }

    const ability = passive ? pokemon.getPassiveAbility() : pokemon.getAbility();
    for (const attr of ability.getAttrs(attrType)) {
      const condition = attr.getCondition();
      if (condition && !condition(pokemon)) {
        continue;
      }

      pokemon.scene.setPhaseQueueSplice();

      let result = applyFunc(attr, passive);
      // TODO Remove this when promises get reworked
      if (result instanceof Promise) {
        result = await result;
      }
      if (result) {
        if (pokemon.summonData && !pokemon.summonData.abilitiesApplied.includes(ability.id)) {
          pokemon.summonData.abilitiesApplied.push(ability.id);
        }
        if (pokemon.battleData && !simulated && !pokemon.battleData.abilitiesApplied.includes(ability.id)) {
          pokemon.battleData.abilitiesApplied.push(ability.id);
        }
        if (attr.showAbility && !simulated) {
          if (showAbilityInstant) {
            pokemon.scene.abilityBar.showAbility(pokemon, passive);
          } else {
            queueShowAbility(pokemon, passive);
          }
        }
        const message = attr.getTriggerMessage(pokemon, ability.name, args);
        if (message) {
          if (!simulated) {
            pokemon.scene.queueMessage(message);
          }
        }
        messages.push(message!);
      }
    }
    pokemon.scene.clearPhaseQueueSplice();
  }
}

class ForceSwitchOutHelper {
  constructor(private switchType: SwitchType) {}

  /**
   * Handles the logic for switching out a Pokémon based on battle conditions, HP, and the switch type.
   *
   * @param pokemon The {@linkcode Pokemon} attempting to switch out.
   * @returns `true` if the switch is successful
   */
  public switchOutLogic(pokemon: Pokemon): boolean {
    const switchOutTarget = pokemon;
    /**
     * If the switch-out target is a player-controlled Pokémon, the function checks:
     * - Whether there are available party members to switch in.
     * - If the Pokémon is still alive (hp > 0), and if so, it leaves the field and a new SwitchPhase is initiated.
     */
    if (switchOutTarget instanceof PlayerPokemon) {
      if (switchOutTarget.scene.getPlayerParty().filter((p) => p.isAllowedInBattle() && !p.isOnField()).length < 1) {
        return false;
      }

      if (switchOutTarget.hp > 0) {
        switchOutTarget.leaveField(this.switchType === SwitchType.SWITCH);
        pokemon.scene.prependToPhase(new SwitchPhase(pokemon.scene, this.switchType, switchOutTarget.getFieldIndex(), true, true), MoveEndPhase);
        return true;
      }
    /**
     * For non-wild battles, it checks if the opposing party has any available Pokémon to switch in.
     * If yes, the Pokémon leaves the field and a new SwitchSummonPhase is initiated.
     */
    } else if (pokemon.scene.currentBattle.battleType !== BattleType.WILD) {
      if (switchOutTarget.scene.getEnemyParty().filter((p) => p.isAllowedInBattle() && !p.isOnField()).length < 1) {
        return false;
      }
      if (switchOutTarget.hp > 0) {
        switchOutTarget.leaveField(this.switchType === SwitchType.SWITCH);
        pokemon.scene.prependToPhase(new SwitchSummonPhase(pokemon.scene, this.switchType, switchOutTarget.getFieldIndex(),
          (pokemon.scene.currentBattle.trainer ? pokemon.scene.currentBattle.trainer.getNextSummonIndex((switchOutTarget as EnemyPokemon).trainerSlot) : 0),
          false, false), MoveEndPhase);
        return true;
      }
    /**
     * For wild Pokémon battles, the Pokémon will flee if the conditions are met (waveIndex and double battles).
     * It will not flee if it is a Mystery Encounter with fleeing disabled (checked in `getSwitchOutCondition()`) or if it is a wave 10x wild boss
     */
    } else {
      if (!pokemon.scene.currentBattle.waveIndex || pokemon.scene.currentBattle.waveIndex % 10 === 0) {
        return false;
      }

      if (switchOutTarget.hp > 0) {
        switchOutTarget.leaveField(false);
        pokemon.scene.queueMessage(i18next.t("moveTriggers:fled", { pokemonName: getPokemonNameWithAffix(switchOutTarget) }), null, true, 500);

        if (switchOutTarget.scene.currentBattle.double) {
          const allyPokemon = switchOutTarget.getAlly();
          switchOutTarget.scene.redirectPokemonMoves(switchOutTarget, allyPokemon);
        }
      }

      if (!switchOutTarget.getAlly()?.isActive(true)) {
        pokemon.scene.clearEnemyHeldItemModifiers();

        if (switchOutTarget.hp) {
          pokemon.scene.pushPhase(new BattleEndPhase(pokemon.scene, false));
          pokemon.scene.pushPhase(new NewBattlePhase(pokemon.scene));
        }
      }
    }
    return false;
  }

  /**
   * Determines if a Pokémon can switch out based on its status, the opponent's status, and battle conditions.
   *
   * @param pokemon The Pokémon attempting to switch out.
   * @param opponent The opponent Pokémon.
   * @returns `true` if the switch-out condition is met
   */
  public getSwitchOutCondition(pokemon: Pokemon, opponent: Pokemon): boolean {
    const switchOutTarget = pokemon;
    const player = switchOutTarget instanceof PlayerPokemon;

    if (player) {
      const blockedByAbility = new Utils.BooleanHolder(false);
      applyAbAttrs(ForceSwitchOutImmunityAbAttr, opponent, blockedByAbility);
      return !blockedByAbility.value;
    }

    if (!player && pokemon.scene.currentBattle.battleType === BattleType.WILD) {
      if (!pokemon.scene.currentBattle.waveIndex && pokemon.scene.currentBattle.waveIndex % 10 === 0) {
        return false;
      }
    }

    if (!player && pokemon.scene.currentBattle.isBattleMysteryEncounter() && !pokemon.scene.currentBattle.mysteryEncounter?.fleeAllowed) {
      return false;
    }

    const party = player ? pokemon.scene.getPlayerParty() : pokemon.scene.getEnemyParty();
    return (!player && pokemon.scene.currentBattle.battleType === BattleType.WILD)
      || party.filter(p => p.isAllowedInBattle()
        && (player || (p as EnemyPokemon).trainerSlot === (switchOutTarget as EnemyPokemon).trainerSlot)).length > pokemon.scene.currentBattle.getBattlerCount();
  }

  /**
   * Returns a message if the switch-out attempt fails due to ability effects.
   *
   * @param target The target Pokémon.
   * @returns The failure message, or `null` if no failure.
   */
  public getFailedText(target: Pokemon): string | null {
    const blockedByAbility = new Utils.BooleanHolder(false);
    applyAbAttrs(ForceSwitchOutImmunityAbAttr, target, blockedByAbility);
    return blockedByAbility.value ? i18next.t("moveTriggers:cannotBeSwitchedOut", { pokemonName: getPokemonNameWithAffix(target) }) : null;
  }
}

/**
 * Calculates the amount of recovery from the Shell Bell item.
 *
 * If the Pokémon is holding a Shell Bell, this function computes the amount of health
 * recovered based on the damage dealt in the current turn. The recovery is multiplied by the
 * Shell Bell's modifier (if any).
 *
 * @param pokemon - The Pokémon whose Shell Bell recovery is being calculated.
 * @returns The amount of health recovered by Shell Bell.
 */
function calculateShellBellRecovery(pokemon: Pokemon): number {
  const shellBellModifier = pokemon.getHeldItems().find(m => m instanceof HitHealModifier);
  if (shellBellModifier) {
    return Utils.toDmgValue(pokemon.turnData.totalDamageDealt / 8) * shellBellModifier.stackCount;
  }
  return 0;
}

/**
 * Triggers after the Pokemon takes any damage
 * @extends AbAttr
 */
export class PostDamageAbAttr extends AbAttr {
  public applyPostDamage(pokemon: Pokemon, damage: number, passive: boolean, simulated: boolean, args: any[], source?: Pokemon): boolean | Promise<boolean> {
    return false;
  }
}

/**
 * Ability attribute for forcing a Pokémon to switch out after its health drops below half.
 * This attribute checks various conditions related to the damage received, the moves used by the Pokémon
 * and its opponents, and determines whether a forced switch-out should occur.
 *
 * Used by Wimp Out and Emergency Exit
 *
 * @extends PostDamageAbAttr
 * @see {@linkcode applyPostDamage}
 */
export class PostDamageForceSwitchAbAttr extends PostDamageAbAttr {
  private helper: ForceSwitchOutHelper = new ForceSwitchOutHelper(SwitchType.SWITCH);
  private hpRatio: number;

  constructor(hpRatio: number = 0.5) {
    super();
    this.hpRatio = hpRatio;
  }

  /**
   * Applies the switch-out logic after the Pokémon takes damage.
   * Checks various conditions based on the moves used by the Pokémon, the opponents' moves, and
   * the Pokémon's health after damage to determine whether the switch-out should occur.
   *
   * @param pokemon The Pokémon that took damage.
   * @param damage The amount of damage taken by the Pokémon.
   * @param passive N/A
   * @param simulated Whether the ability is being simulated.
   * @param args N/A
   * @param source The Pokemon that dealt damage
   * @returns `true` if the switch-out logic was successfully applied
   */
  public override applyPostDamage(pokemon: Pokemon, damage: number, passive: boolean, simulated: boolean, args: any[], source?: Pokemon): boolean | Promise<boolean> {
    const moveHistory = pokemon.getMoveHistory();
    // Will not activate when the Pokémon's HP is lowered by cutting its own HP
    const fordbiddenAttackingMoves = [ Moves.BELLY_DRUM, Moves.SUBSTITUTE, Moves.CURSE, Moves.PAIN_SPLIT ];
    if (moveHistory.length > 0) {
      const lastMoveUsed = moveHistory[moveHistory.length - 1];
      if (fordbiddenAttackingMoves.includes(lastMoveUsed.move)) {
        return false;
      }
    }

    // Dragon Tail and Circle Throw switch out Pokémon before the Ability activates.
    const fordbiddenDefendingMoves = [ Moves.DRAGON_TAIL, Moves.CIRCLE_THROW ];
    if (source) {
      const enemyMoveHistory = source.getMoveHistory();
      if (enemyMoveHistory.length > 0) {
        const enemyLastMoveUsed = enemyMoveHistory[enemyMoveHistory.length - 1];
        // Will not activate if the Pokémon's HP falls below half while it is in the air during Sky Drop.
        if (fordbiddenDefendingMoves.includes(enemyLastMoveUsed.move) || enemyLastMoveUsed.move === Moves.SKY_DROP && enemyLastMoveUsed.result === MoveResult.OTHER) {
          return false;
        // Will not activate if the Pokémon's HP falls below half by a move affected by Sheer Force.
        } else if (allMoves[enemyLastMoveUsed.move].chance >= 0 && source.hasAbility(Abilities.SHEER_FORCE)) {
          return false;
        // Activate only after the last hit of multistrike moves
        } else if (source.turnData.hitsLeft > 1) {
          return false;
        }
        if (source.turnData.hitCount > 1) {
          damage = pokemon.turnData.damageTaken;
        }
      }
    }

    if (pokemon.hp + damage >= pokemon.getMaxHp() * this.hpRatio) {
      // Activates if it falls below half and recovers back above half from a Shell Bell
      const shellBellHeal = calculateShellBellRecovery(pokemon);
      if (pokemon.hp - shellBellHeal < pokemon.getMaxHp() * this.hpRatio) {
        for (const opponent of pokemon.getOpponents()) {
          if (!this.helper.getSwitchOutCondition(pokemon, opponent)) {
            return false;
          }
        }
        return this.helper.switchOutLogic(pokemon);
      } else {
        return false;
      }
    } else {
      return false;
    }
  }
  public getFailedText(user: Pokemon, target: Pokemon, move: Move, cancelled: Utils.BooleanHolder): string | null {
    return this.helper.getFailedText(target);
  }
}


export function applyAbAttrs(attrType: Constructor<AbAttr>, pokemon: Pokemon, cancelled: Utils.BooleanHolder | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<AbAttr>(attrType, pokemon, (attr, passive) => attr.apply(pokemon, passive, simulated, cancelled, args), args, false, simulated);
}

export function applyPostBattleInitAbAttrs(attrType: Constructor<PostBattleInitAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostBattleInitAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostBattleInit(pokemon, passive, simulated, args), args, false, simulated);
}

export function applyPreDefendAbAttrs(attrType: Constructor<PreDefendAbAttr>,
  pokemon: Pokemon, attacker: Pokemon, move: Move | null, cancelled: Utils.BooleanHolder | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreDefendAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreDefend(pokemon, passive, simulated, attacker, move, cancelled, args), args, false, simulated);
}

export function applyPostDefendAbAttrs(attrType: Constructor<PostDefendAbAttr>,
  pokemon: Pokemon, attacker: Pokemon, move: Move, hitResult: HitResult | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostDefendAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostDefend(pokemon, passive, simulated, attacker, move, hitResult, args), args, false, simulated);
}

export function applyPostMoveUsedAbAttrs(attrType: Constructor<PostMoveUsedAbAttr>,
  pokemon: Pokemon, move: PokemonMove, source: Pokemon, targets: BattlerIndex[], simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostMoveUsedAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostMoveUsed(pokemon, move, source, targets, simulated, args), args, false, simulated);
}

export function applyStatMultiplierAbAttrs(attrType: Constructor<StatMultiplierAbAttr>,
  pokemon: Pokemon, stat: BattleStat, statValue: Utils.NumberHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<StatMultiplierAbAttr>(attrType, pokemon, (attr, passive) => attr.applyStatStage(pokemon, passive, simulated, stat, statValue, args), args);
}
export function applyPostSetStatusAbAttrs(attrType: Constructor<PostSetStatusAbAttr>,
  pokemon: Pokemon, effect: StatusEffect, sourcePokemon?: Pokemon | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostSetStatusAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostSetStatus(pokemon, sourcePokemon, passive, effect, simulated, args), args, false, simulated);
}

export function applyPostDamageAbAttrs(attrType: Constructor<PostDamageAbAttr>,
  pokemon: Pokemon, damage: number, passive: boolean, simulated: boolean = false, args: any[], source?: Pokemon): Promise<void> {
  return applyAbAttrsInternal<PostDamageAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostDamage(pokemon, damage, passive, simulated, args, source), args);
}

/**
 * Applies a field Stat multiplier attribute
 * @param attrType {@linkcode FieldMultiplyStatAbAttr} should always be FieldMultiplyBattleStatAbAttr for the time being
 * @param pokemon {@linkcode Pokemon} the Pokemon applying this ability
 * @param stat {@linkcode Stat} the type of the checked stat
 * @param statValue {@linkcode Utils.NumberHolder} the value of the checked stat
 * @param checkedPokemon {@linkcode Pokemon} the Pokemon with the checked stat
 * @param hasApplied {@linkcode Utils.BooleanHolder} whether or not a FieldMultiplyBattleStatAbAttr has already affected this stat
 * @param args unused
 */
export function applyFieldStatMultiplierAbAttrs(attrType: Constructor<FieldMultiplyStatAbAttr>,
  pokemon: Pokemon, stat: Stat, statValue: Utils.NumberHolder, checkedPokemon: Pokemon, hasApplied: Utils.BooleanHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<FieldMultiplyStatAbAttr>(attrType, pokemon, (attr, passive) => attr.applyFieldStat(pokemon, passive, simulated, stat, statValue, checkedPokemon, hasApplied, args), args);
}

export function applyPreAttackAbAttrs(attrType: Constructor<PreAttackAbAttr>,
  pokemon: Pokemon, defender: Pokemon | null, move: Move, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreAttackAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreAttack(pokemon, passive, simulated, defender, move, args), args, false, simulated);
}

export function applyPostAttackAbAttrs(attrType: Constructor<PostAttackAbAttr>,
  pokemon: Pokemon, defender: Pokemon, move: Move, hitResult: HitResult | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostAttackAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostAttack(pokemon, passive, simulated, defender, move, hitResult, args), args, false, simulated);
}

export function applyPostKnockOutAbAttrs(attrType: Constructor<PostKnockOutAbAttr>,
  pokemon: Pokemon, knockedOut: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostKnockOutAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostKnockOut(pokemon, passive, simulated, knockedOut, args), args, false, simulated);
}

export function applyPostVictoryAbAttrs(attrType: Constructor<PostVictoryAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostVictoryAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostVictory(pokemon, passive, simulated, args), args, false, simulated);
}

export function applyPostSummonAbAttrs(attrType: Constructor<PostSummonAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostSummonAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostSummon(pokemon, passive, simulated, args), args, false, simulated);
}

export function applyPreSwitchOutAbAttrs(attrType: Constructor<PreSwitchOutAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreSwitchOutAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreSwitchOut(pokemon, passive, simulated, args), args, true, simulated);
}

export function applyPreStatStageChangeAbAttrs(attrType: Constructor<PreStatStageChangeAbAttr>,
  pokemon: Pokemon | null, stat: BattleStat, cancelled: Utils.BooleanHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreStatStageChangeAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreStatStageChange(pokemon, passive, simulated, stat, cancelled, args), args, false, simulated);
}

export function applyPostStatStageChangeAbAttrs(attrType: Constructor<PostStatStageChangeAbAttr>,
  pokemon: Pokemon, stats: BattleStat[], stages: integer, selfTarget: boolean, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostStatStageChangeAbAttr>(attrType, pokemon, (attr, _passive) => attr.applyPostStatStageChange(pokemon, simulated, stats, stages, selfTarget, args), args, false, simulated);
}

export function applyPreSetStatusAbAttrs(attrType: Constructor<PreSetStatusAbAttr>,
  pokemon: Pokemon, effect: StatusEffect | undefined, cancelled: Utils.BooleanHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreSetStatusAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreSetStatus(pokemon, passive, simulated, effect, cancelled, args), args, false, simulated);
}

export function applyPreApplyBattlerTagAbAttrs(attrType: Constructor<PreApplyBattlerTagAbAttr>,
  pokemon: Pokemon, tag: BattlerTag, cancelled: Utils.BooleanHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreApplyBattlerTagAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreApplyBattlerTag(pokemon, passive, simulated, tag, cancelled, args), args, false, simulated);
}

export function applyPreWeatherEffectAbAttrs(attrType: Constructor<PreWeatherEffectAbAttr>,
  pokemon: Pokemon, weather: Weather | null, cancelled: Utils.BooleanHolder, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PreWeatherDamageAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPreWeatherEffect(pokemon, passive, simulated, weather, cancelled, args), args, true, simulated);
}

export function applyPostTurnAbAttrs(attrType: Constructor<PostTurnAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostTurnAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostTurn(pokemon, passive, simulated, args), args, false, simulated);
}

export function applyPostWeatherChangeAbAttrs(attrType: Constructor<PostWeatherChangeAbAttr>,
  pokemon: Pokemon, weather: WeatherType, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostWeatherChangeAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostWeatherChange(pokemon, passive, simulated, weather, args), args, false, simulated);
}

export function applyPostWeatherLapseAbAttrs(attrType: Constructor<PostWeatherLapseAbAttr>,
  pokemon: Pokemon, weather: Weather | null, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostWeatherLapseAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostWeatherLapse(pokemon, passive, simulated, weather, args), args, false, simulated);
}

export function applyPostTerrainChangeAbAttrs(attrType: Constructor<PostTerrainChangeAbAttr>,
  pokemon: Pokemon, terrain: TerrainType, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostTerrainChangeAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostTerrainChange(pokemon, passive, simulated, terrain, args), args, false, simulated);
}

export function applyCheckTrappedAbAttrs(attrType: Constructor<CheckTrappedAbAttr>,
  pokemon: Pokemon, trapped: Utils.BooleanHolder, otherPokemon: Pokemon, messages: string[], simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<CheckTrappedAbAttr>(attrType, pokemon, (attr, passive) => attr.applyCheckTrapped(pokemon, passive, simulated, trapped, otherPokemon, args), args, false, simulated, messages);
}

export function applyPostBattleAbAttrs(attrType: Constructor<PostBattleAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostBattleAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostBattle(pokemon, passive, simulated, args), args, false, simulated);
}

export function applyPostFaintAbAttrs(attrType: Constructor<PostFaintAbAttr>,
  pokemon: Pokemon, attacker?: Pokemon, move?: Move, hitResult?: HitResult, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostFaintAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostFaint(pokemon, passive, simulated, attacker, move, hitResult, args), args, false, simulated);
}

export function applyPostItemLostAbAttrs(attrType: Constructor<PostItemLostAbAttr>,
  pokemon: Pokemon, simulated: boolean = false, ...args: any[]): Promise<void> {
  return applyAbAttrsInternal<PostItemLostAbAttr>(attrType, pokemon, (attr, passive) => attr.applyPostItemLost(pokemon, simulated, args), args);
}

function queueShowAbility(pokemon: Pokemon, passive: boolean): void {
  pokemon.scene.unshiftPhase(new ShowAbilityPhase(pokemon.scene, pokemon.id, passive));
  pokemon.scene.clearPhaseQueueSplice();
}

/**
 * Sets the ability of a Pokémon as revealed.
 *
 * @param pokemon - The Pokémon whose ability is being revealed.
 */
function setAbilityRevealed(pokemon: Pokemon): void {
  if (pokemon.battleData) {
    pokemon.battleData.abilityRevealed = true;
  }
}

/**
 * Returns the Pokemon with weather-based forms
 * @param {BattleScene} scene - The current scene
 */
function getPokemonWithWeatherBasedForms(scene: BattleScene) {
  return scene.getField(true).filter(p =>
    (p.hasAbility(Abilities.FORECAST) && p.species.speciesId === Species.CASTFORM)
    || (p.hasAbility(Abilities.FLOWER_GIFT) && p.species.speciesId === Species.CHERRIM)
  );
}

export const allAbilities = [ new Ability(Abilities.NONE, 3) ];

export function initAbilities() {
  allAbilities.push(
    new Ability(Abilities.STENCH, 3)
      .attr(PostAttackApplyBattlerTagAbAttr, false, (user, target, move) => !move.hasAttr(FlinchAttr) && !move.hitsSubstitute(user, target) ? 10 : 0, BattlerTagType.FLINCHED),
    new Ability(Abilities.DRIZZLE, 3)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.RAIN)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.RAIN),
    new Ability(Abilities.SPEED_BOOST, 3)
      .attr(SpeedBoostAbAttr),
    new Ability(Abilities.BATTLE_ARMOR, 3)
      .attr(BlockCritAbAttr)
      .ignorable(),
    new Ability(Abilities.STURDY, 3)
      .attr(PreDefendFullHpEndureAbAttr)
      .attr(BlockOneHitKOAbAttr)
      .ignorable(),
    new Ability(Abilities.DAMP, 3)
      .attr(FieldPreventExplosiveMovesAbAttr)
      .ignorable(),
    new Ability(Abilities.LIMBER, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.PARALYSIS)
      .ignorable(),
    new Ability(Abilities.SAND_VEIL, 3)
      .attr(StatMultiplierAbAttr, Stat.EVA, 1.2)
      .attr(BlockWeatherDamageAttr, WeatherType.SANDSTORM)
      .condition(getWeatherCondition(WeatherType.SANDSTORM))
      .ignorable(),
    new Ability(Abilities.STATIC, 3)
      .attr(PostDefendContactApplyStatusEffectAbAttr, 30, StatusEffect.PARALYSIS)
      .bypassFaint(),
    new Ability(Abilities.VOLT_ABSORB, 3)
      .attr(TypeImmunityHealAbAttr, Type.ELECTRIC)
      .ignorable(),
    new Ability(Abilities.WATER_ABSORB, 3)
      .attr(TypeImmunityHealAbAttr, Type.WATER)
      .ignorable(),
    new Ability(Abilities.OBLIVIOUS, 3)
      .attr(BattlerTagImmunityAbAttr, [ BattlerTagType.INFATUATED, BattlerTagType.TAUNT ])
      .attr(IntimidateImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.CLOUD_NINE, 3)
      .attr(SuppressWeatherEffectAbAttr, true)
      .attr(PostSummonUnnamedMessageAbAttr, i18next.t("abilityTriggers:weatherEffectDisappeared"))
      .attr(PostSummonWeatherSuppressedFormChangeAbAttr)
      .attr(PostFaintUnsuppressedWeatherFormChangeAbAttr)
      .bypassFaint(),
    new Ability(Abilities.COMPOUND_EYES, 3)
      .attr(StatMultiplierAbAttr, Stat.ACC, 1.3),
    new Ability(Abilities.INSOMNIA, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.SLEEP)
      .attr(BattlerTagImmunityAbAttr, BattlerTagType.DROWSY)
      .ignorable(),
    new Ability(Abilities.COLOR_CHANGE, 3)
      .attr(PostDefendTypeChangeAbAttr)
      .condition(getSheerForceHitDisableAbCondition()),
    new Ability(Abilities.IMMUNITY, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.POISON, StatusEffect.TOXIC)
      .ignorable(),
    new Ability(Abilities.FLASH_FIRE, 3)
      .attr(TypeImmunityAddBattlerTagAbAttr, Type.FIRE, BattlerTagType.FIRE_BOOST, 1)
      .ignorable(),
    new Ability(Abilities.SHIELD_DUST, 3)
      .attr(IgnoreMoveEffectsAbAttr)
      .ignorable(),
    new Ability(Abilities.OWN_TEMPO, 3)
      .attr(BattlerTagImmunityAbAttr, BattlerTagType.CONFUSED)
      .attr(IntimidateImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.SUCTION_CUPS, 3)
      .attr(ForceSwitchOutImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.INTIMIDATE, 3)
      .attr(PostSummonStatStageChangeAbAttr, [ Stat.ATK ], -1, false, true),
    new Ability(Abilities.SHADOW_TAG, 3)
      .attr(ArenaTrapAbAttr, (user, target) => {
        if (target.hasAbility(Abilities.SHADOW_TAG)) {
          return false;
        }
        return true;
      }),
    new Ability(Abilities.ROUGH_SKIN, 3)
      .attr(PostDefendContactDamageAbAttr, 8)
      .bypassFaint(),
    new Ability(Abilities.WONDER_GUARD, 3)
      .attr(NonSuperEffectiveImmunityAbAttr)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .ignorable(),
    new Ability(Abilities.LEVITATE, 3)
      .attr(AttackTypeImmunityAbAttr, Type.GROUND, (pokemon: Pokemon) => !pokemon.getTag(GroundedTag) && !pokemon.scene.arena.getTag(ArenaTagType.GRAVITY))
      .ignorable(),
    new Ability(Abilities.EFFECT_SPORE, 3)
      .attr(EffectSporeAbAttr),
    new Ability(Abilities.SYNCHRONIZE, 3)
      .attr(SyncEncounterNatureAbAttr)
      .attr(SynchronizeStatusAbAttr),
    new Ability(Abilities.CLEAR_BODY, 3)
      .attr(ProtectStatAbAttr)
      .ignorable(),
    new Ability(Abilities.NATURAL_CURE, 3)
      .attr(PreSwitchOutResetStatusAbAttr),
    new Ability(Abilities.LIGHTNING_ROD, 3)
      .attr(RedirectTypeMoveAbAttr, Type.ELECTRIC)
      .attr(TypeImmunityStatStageChangeAbAttr, Type.ELECTRIC, Stat.SPATK, 1)
      .ignorable(),
    new Ability(Abilities.SERENE_GRACE, 3)
      .attr(MoveEffectChanceMultiplierAbAttr, 2),
    new Ability(Abilities.SWIFT_SWIM, 3)
      .attr(StatMultiplierAbAttr, Stat.SPD, 2)
      .condition(getWeatherCondition(WeatherType.RAIN, WeatherType.HEAVY_RAIN)),
    new Ability(Abilities.CHLOROPHYLL, 3)
      .attr(StatMultiplierAbAttr, Stat.SPD, 2)
      .condition(getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN)),
    new Ability(Abilities.ILLUMINATE, 3)
      .attr(ProtectStatAbAttr, Stat.ACC)
      .attr(DoubleBattleChanceAbAttr)
      .attr(IgnoreOpponentStatStagesAbAttr, [ Stat.EVA ])
      .ignorable(),
    new Ability(Abilities.TRACE, 3)
      .attr(PostSummonCopyAbilityAbAttr)
      .attr(UncopiableAbilityAbAttr),
    new Ability(Abilities.HUGE_POWER, 3)
      .attr(StatMultiplierAbAttr, Stat.ATK, 2),
    new Ability(Abilities.POISON_POINT, 3)
      .attr(PostDefendContactApplyStatusEffectAbAttr, 30, StatusEffect.POISON)
      .bypassFaint(),
    new Ability(Abilities.INNER_FOCUS, 3)
      .attr(BattlerTagImmunityAbAttr, BattlerTagType.FLINCHED)
      .attr(IntimidateImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.MAGMA_ARMOR, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.FREEZE)
      .ignorable(),
    new Ability(Abilities.WATER_VEIL, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.BURN)
      .ignorable(),
    new Ability(Abilities.MAGNET_PULL, 3)
      .attr(ArenaTrapAbAttr, (user, target) => {
        if (target.getTypes(true).includes(Type.STEEL) || (target.getTypes(true).includes(Type.STELLAR) && target.getTypes().includes(Type.STEEL))) {
          return true;
        }
        return false;
      }),
    new Ability(Abilities.SOUNDPROOF, 3)
      .attr(MoveImmunityAbAttr, (pokemon, attacker, move) => pokemon !== attacker && move.hasFlag(MoveFlags.SOUND_BASED))
      .ignorable(),
    new Ability(Abilities.RAIN_DISH, 3)
      .attr(PostWeatherLapseHealAbAttr, 1, WeatherType.RAIN, WeatherType.HEAVY_RAIN),
    new Ability(Abilities.SAND_STREAM, 3)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.SANDSTORM)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.SANDSTORM),
    new Ability(Abilities.PRESSURE, 3)
      .attr(IncreasePpAbAttr)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonPressure", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) })),
    new Ability(Abilities.THICK_FAT, 3)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.FIRE, 0.5)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.ICE, 0.5)
      .ignorable(),
    new Ability(Abilities.EARLY_BIRD, 3)
      .attr(ReduceStatusEffectDurationAbAttr, StatusEffect.SLEEP),
    new Ability(Abilities.FLAME_BODY, 3)
      .attr(PostDefendContactApplyStatusEffectAbAttr, 30, StatusEffect.BURN)
      .bypassFaint(),
    new Ability(Abilities.RUN_AWAY, 3)
      .attr(RunSuccessAbAttr),
    new Ability(Abilities.KEEN_EYE, 3)
      .attr(ProtectStatAbAttr, Stat.ACC)
      .ignorable(),
    new Ability(Abilities.HYPER_CUTTER, 3)
      .attr(ProtectStatAbAttr, Stat.ATK)
      .ignorable(),
    new Ability(Abilities.PICKUP, 3)
      .attr(PostBattleLootAbAttr),
    new Ability(Abilities.TRUANT, 3)
      .attr(PostSummonAddBattlerTagAbAttr, BattlerTagType.TRUANT, 1, false),
    new Ability(Abilities.HUSTLE, 3)
      .attr(StatMultiplierAbAttr, Stat.ATK, 1.5)
      .attr(StatMultiplierAbAttr, Stat.ACC, 0.8, (_user, _target, move) => move.category === MoveCategory.PHYSICAL),
    new Ability(Abilities.CUTE_CHARM, 3)
      .attr(PostDefendContactApplyTagChanceAbAttr, 30, BattlerTagType.INFATUATED),
    new Ability(Abilities.PLUS, 3)
      .conditionalAttr(p => p.scene.currentBattle.double && [ Abilities.PLUS, Abilities.MINUS ].some(a => p.getAlly().hasAbility(a)), StatMultiplierAbAttr, Stat.SPATK, 1.5),
    new Ability(Abilities.MINUS, 3)
      .conditionalAttr(p => p.scene.currentBattle.double && [ Abilities.PLUS, Abilities.MINUS ].some(a => p.getAlly().hasAbility(a)), StatMultiplierAbAttr, Stat.SPATK, 1.5),
    new Ability(Abilities.FORECAST, 3)
      .attr(UncopiableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .attr(PostSummonFormChangeByWeatherAbAttr, Abilities.FORECAST)
      .attr(PostWeatherChangeFormChangeAbAttr, Abilities.FORECAST, [ WeatherType.NONE, WeatherType.SANDSTORM, WeatherType.STRONG_WINDS, WeatherType.FOG ]),
    new Ability(Abilities.STICKY_HOLD, 3)
      .attr(BlockItemTheftAbAttr)
      .bypassFaint()
      .ignorable(),
    new Ability(Abilities.SHED_SKIN, 3)
      .conditionalAttr(pokemon => !Utils.randSeedInt(3), PostTurnResetStatusAbAttr),
    new Ability(Abilities.GUTS, 3)
      .attr(BypassBurnDamageReductionAbAttr)
      .conditionalAttr(pokemon => !!pokemon.status || pokemon.hasAbility(Abilities.COMATOSE), StatMultiplierAbAttr, Stat.ATK, 1.5),
    new Ability(Abilities.MARVEL_SCALE, 3)
      .conditionalAttr(pokemon => !!pokemon.status || pokemon.hasAbility(Abilities.COMATOSE), StatMultiplierAbAttr, Stat.DEF, 1.5)
      .ignorable(),
    new Ability(Abilities.LIQUID_OOZE, 3)
      .attr(ReverseDrainAbAttr),
    new Ability(Abilities.OVERGROW, 3)
      .attr(LowHpMoveTypePowerBoostAbAttr, Type.GRASS),
    new Ability(Abilities.BLAZE, 3)
      .attr(LowHpMoveTypePowerBoostAbAttr, Type.FIRE),
    new Ability(Abilities.TORRENT, 3)
      .attr(LowHpMoveTypePowerBoostAbAttr, Type.WATER),
    new Ability(Abilities.SWARM, 3)
      .attr(LowHpMoveTypePowerBoostAbAttr, Type.BUG),
    new Ability(Abilities.ROCK_HEAD, 3)
      .attr(BlockRecoilDamageAttr),
    new Ability(Abilities.DROUGHT, 3)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.SUNNY)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.SUNNY),
    new Ability(Abilities.ARENA_TRAP, 3)
      .attr(ArenaTrapAbAttr, (user, target) => {
        if (target.isGrounded()) {
          return true;
        }
        return false;
      })
      .attr(DoubleBattleChanceAbAttr),
    new Ability(Abilities.VITAL_SPIRIT, 3)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.SLEEP)
      .attr(BattlerTagImmunityAbAttr, BattlerTagType.DROWSY)
      .ignorable(),
    new Ability(Abilities.WHITE_SMOKE, 3)
      .attr(ProtectStatAbAttr)
      .ignorable(),
    new Ability(Abilities.PURE_POWER, 3)
      .attr(StatMultiplierAbAttr, Stat.ATK, 2),
    new Ability(Abilities.SHELL_ARMOR, 3)
      .attr(BlockCritAbAttr)
      .ignorable(),
    new Ability(Abilities.AIR_LOCK, 3)
      .attr(SuppressWeatherEffectAbAttr, true)
      .attr(PostSummonUnnamedMessageAbAttr, i18next.t("abilityTriggers:weatherEffectDisappeared"))
      .attr(PostSummonWeatherSuppressedFormChangeAbAttr)
      .attr(PostFaintUnsuppressedWeatherFormChangeAbAttr)
      .bypassFaint(),
    new Ability(Abilities.TANGLED_FEET, 4)
      .conditionalAttr(pokemon => !!pokemon.getTag(BattlerTagType.CONFUSED), StatMultiplierAbAttr, Stat.EVA, 2)
      .ignorable(),
    new Ability(Abilities.MOTOR_DRIVE, 4)
      .attr(TypeImmunityStatStageChangeAbAttr, Type.ELECTRIC, Stat.SPD, 1)
      .ignorable(),
    new Ability(Abilities.RIVALRY, 4)
      .attr(MovePowerBoostAbAttr, (user, target, move) => user?.gender !== Gender.GENDERLESS && target?.gender !== Gender.GENDERLESS && user?.gender === target?.gender, 1.25, true)
      .attr(MovePowerBoostAbAttr, (user, target, move) => user?.gender !== Gender.GENDERLESS && target?.gender !== Gender.GENDERLESS && user?.gender !== target?.gender, 0.75),
    new Ability(Abilities.STEADFAST, 4)
      .attr(FlinchStatStageChangeAbAttr, [ Stat.SPD ], 1),
    new Ability(Abilities.SNOW_CLOAK, 4)
      .attr(StatMultiplierAbAttr, Stat.EVA, 1.2)
      .attr(BlockWeatherDamageAttr, WeatherType.HAIL)
      .condition(getWeatherCondition(WeatherType.HAIL, WeatherType.SNOW))
      .ignorable(),
    new Ability(Abilities.GLUTTONY, 4)
      .attr(ReduceBerryUseThresholdAbAttr),
    new Ability(Abilities.ANGER_POINT, 4)
      .attr(PostDefendCritStatStageChangeAbAttr, Stat.ATK, 6),
    new Ability(Abilities.UNBURDEN, 4)
      .attr(PostItemLostApplyBattlerTagAbAttr, BattlerTagType.UNBURDEN)
      .bypassFaint() // Allows reviver seed to activate Unburden
      .edgeCase(), // Should not restore Unburden boost if Pokemon loses then regains Unburden ability
    new Ability(Abilities.HEATPROOF, 4)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.FIRE, 0.5)
      .attr(ReduceBurnDamageAbAttr, 0.5)
      .ignorable(),
    new Ability(Abilities.SIMPLE, 4)
      .attr(StatStageChangeMultiplierAbAttr, 2)
      .ignorable(),
    new Ability(Abilities.DRY_SKIN, 4)
      .attr(PostWeatherLapseDamageAbAttr, 2, WeatherType.SUNNY, WeatherType.HARSH_SUN)
      .attr(PostWeatherLapseHealAbAttr, 2, WeatherType.RAIN, WeatherType.HEAVY_RAIN)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.FIRE, 1.25)
      .attr(TypeImmunityHealAbAttr, Type.WATER)
      .ignorable(),
    new Ability(Abilities.DOWNLOAD, 4)
      .attr(DownloadAbAttr),
    new Ability(Abilities.IRON_FIST, 4)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.PUNCHING_MOVE), 1.2),
    new Ability(Abilities.POISON_HEAL, 4)
      .attr(PostTurnStatusHealAbAttr, StatusEffect.TOXIC, StatusEffect.POISON)
      .attr(BlockStatusDamageAbAttr, StatusEffect.TOXIC, StatusEffect.POISON),
    new Ability(Abilities.ADAPTABILITY, 4)
      .attr(StabBoostAbAttr),
    new Ability(Abilities.SKILL_LINK, 4)
      .attr(MaxMultiHitAbAttr),
    new Ability(Abilities.HYDRATION, 4)
      .attr(PostTurnResetStatusAbAttr)
      .condition(getWeatherCondition(WeatherType.RAIN, WeatherType.HEAVY_RAIN)),
    new Ability(Abilities.SOLAR_POWER, 4)
      .attr(PostWeatherLapseDamageAbAttr, 2, WeatherType.SUNNY, WeatherType.HARSH_SUN)
      .attr(StatMultiplierAbAttr, Stat.SPATK, 1.5)
      .condition(getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN)),
    new Ability(Abilities.QUICK_FEET, 4)
      .conditionalAttr(pokemon => pokemon.status ? pokemon.status.effect === StatusEffect.PARALYSIS : false, StatMultiplierAbAttr, Stat.SPD, 2)
      .conditionalAttr(pokemon => !!pokemon.status || pokemon.hasAbility(Abilities.COMATOSE), StatMultiplierAbAttr, Stat.SPD, 1.5),
    new Ability(Abilities.NORMALIZE, 4)
      .attr(MoveTypeChangeAbAttr, Type.NORMAL, 1.2, (user, target, move) => {
        return ![ Moves.HIDDEN_POWER, Moves.WEATHER_BALL, Moves.NATURAL_GIFT, Moves.JUDGMENT, Moves.TECHNO_BLAST ].includes(move.id);
      }),
    new Ability(Abilities.SNIPER, 4)
      .attr(MultCritAbAttr, 1.5),
    new Ability(Abilities.MAGIC_GUARD, 4)
      .attr(BlockNonDirectDamageAbAttr),
    new Ability(Abilities.NO_GUARD, 4)
      .attr(AlwaysHitAbAttr)
      .attr(DoubleBattleChanceAbAttr),
    new Ability(Abilities.STALL, 4)
      .attr(ChangeMovePriorityAbAttr, (pokemon, move: Move) => true, -0.2),
    new Ability(Abilities.TECHNICIAN, 4)
      .attr(MovePowerBoostAbAttr, (user, target, move) => {
        const power = new Utils.NumberHolder(move.power);
        applyMoveAttrs(VariablePowerAttr, user, target, move, power);
        return power.value <= 60;
      }, 1.5),
    new Ability(Abilities.LEAF_GUARD, 4)
      .attr(StatusEffectImmunityAbAttr)
      .condition(getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN))
      .ignorable(),
    new Ability(Abilities.KLUTZ, 4)
      .unimplemented(),
    new Ability(Abilities.MOLD_BREAKER, 4)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonMoldBreaker", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(MoveAbilityBypassAbAttr),
    new Ability(Abilities.SUPER_LUCK, 4)
      .attr(BonusCritAbAttr),
    new Ability(Abilities.AFTERMATH, 4)
      .attr(PostFaintContactDamageAbAttr, 4)
      .bypassFaint(),
    new Ability(Abilities.ANTICIPATION, 4)
      .conditionalAttr(getAnticipationCondition(), PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonAnticipation", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) })),
    new Ability(Abilities.FOREWARN, 4)
      .attr(ForewarnAbAttr),
    new Ability(Abilities.UNAWARE, 4)
      .attr(IgnoreOpponentStatStagesAbAttr, [ Stat.ATK, Stat.DEF, Stat.SPATK, Stat.SPDEF, Stat.ACC, Stat.EVA ])
      .ignorable(),
    new Ability(Abilities.TINTED_LENS, 4)
      .attr(DamageBoostAbAttr, 2, (user, target, move) => (target?.getMoveEffectiveness(user!, move) ?? 1) <= 0.5),
    new Ability(Abilities.FILTER, 4)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => target.getMoveEffectiveness(user, move) >= 2, 0.75)
      .ignorable(),
    new Ability(Abilities.SLOW_START, 4)
      .attr(PostSummonAddBattlerTagAbAttr, BattlerTagType.SLOW_START, 5),
    new Ability(Abilities.SCRAPPY, 4)
      .attr(IgnoreTypeImmunityAbAttr, Type.GHOST, [ Type.NORMAL, Type.FIGHTING ])
      .attr(IntimidateImmunityAbAttr),
    new Ability(Abilities.STORM_DRAIN, 4)
      .attr(RedirectTypeMoveAbAttr, Type.WATER)
      .attr(TypeImmunityStatStageChangeAbAttr, Type.WATER, Stat.SPATK, 1)
      .ignorable(),
    new Ability(Abilities.ICE_BODY, 4)
      .attr(BlockWeatherDamageAttr, WeatherType.HAIL)
      .attr(PostWeatherLapseHealAbAttr, 1, WeatherType.HAIL, WeatherType.SNOW),
    new Ability(Abilities.SOLID_ROCK, 4)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => target.getMoveEffectiveness(user, move) >= 2, 0.75)
      .ignorable(),
    new Ability(Abilities.SNOW_WARNING, 4)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.SNOW)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.SNOW),
    new Ability(Abilities.HONEY_GATHER, 4)
      .attr(MoneyAbAttr),
    new Ability(Abilities.FRISK, 4)
      .attr(FriskAbAttr),
    new Ability(Abilities.RECKLESS, 4)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.RECKLESS_MOVE), 1.2),
    new Ability(Abilities.MULTITYPE, 4)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr),
    new Ability(Abilities.FLOWER_GIFT, 4)
      .conditionalAttr(getWeatherCondition(WeatherType.SUNNY || WeatherType.HARSH_SUN), StatMultiplierAbAttr, Stat.ATK, 1.5)
      .conditionalAttr(getWeatherCondition(WeatherType.SUNNY || WeatherType.HARSH_SUN), StatMultiplierAbAttr, Stat.SPDEF, 1.5)
      .attr(UncopiableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .attr(PostSummonFormChangeByWeatherAbAttr, Abilities.FLOWER_GIFT)
      .attr(PostWeatherChangeFormChangeAbAttr, Abilities.FLOWER_GIFT, [ WeatherType.NONE, WeatherType.SANDSTORM, WeatherType.STRONG_WINDS, WeatherType.FOG, WeatherType.HAIL, WeatherType.HEAVY_RAIN, WeatherType.SNOW, WeatherType.RAIN ])
      .partial() // Should also boosts stats of ally
      .ignorable(),
    new Ability(Abilities.BAD_DREAMS, 4)
      .attr(PostTurnHurtIfSleepingAbAttr),
    new Ability(Abilities.PICKPOCKET, 5)
      .attr(PostDefendStealHeldItemAbAttr, (target, user, move) => move.hasFlag(MoveFlags.MAKES_CONTACT))
      .condition(getSheerForceHitDisableAbCondition()),
    new Ability(Abilities.SHEER_FORCE, 5)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.chance >= 1, 5461 / 4096)
      .attr(MoveEffectChanceMultiplierAbAttr, 0), // Should disable life orb, eject button, red card, kee/maranga berry if they get implemented
    new Ability(Abilities.CONTRARY, 5)
      .attr(StatStageChangeMultiplierAbAttr, -1)
      .ignorable(),
    new Ability(Abilities.UNNERVE, 5)
      .attr(PreventBerryUseAbAttr),
    new Ability(Abilities.DEFIANT, 5)
      .attr(PostStatStageChangeStatStageChangeAbAttr, (target, statsChanged, stages) => stages < 0, [ Stat.ATK ], 2),
    new Ability(Abilities.DEFEATIST, 5)
      .attr(StatMultiplierAbAttr, Stat.ATK, 0.5)
      .attr(StatMultiplierAbAttr, Stat.SPATK, 0.5)
      .condition((pokemon) => pokemon.getHpRatio() <= 0.5),
    new Ability(Abilities.CURSED_BODY, 5)
      .attr(PostDefendMoveDisableAbAttr, 30)
      .bypassFaint(),
    new Ability(Abilities.HEALER, 5)
      .conditionalAttr(pokemon => pokemon.getAlly() && Utils.randSeedInt(10) < 3, PostTurnResetStatusAbAttr, true),
    new Ability(Abilities.FRIEND_GUARD, 5)
      .attr(AlliedFieldDamageReductionAbAttr, 0.75)
      .ignorable(),
    new Ability(Abilities.WEAK_ARMOR, 5)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.category === MoveCategory.PHYSICAL, Stat.DEF, -1)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.category === MoveCategory.PHYSICAL, Stat.SPD, 2),
    new Ability(Abilities.HEAVY_METAL, 5)
      .attr(WeightMultiplierAbAttr, 2)
      .ignorable(),
    new Ability(Abilities.LIGHT_METAL, 5)
      .attr(WeightMultiplierAbAttr, 0.5)
      .ignorable(),
    new Ability(Abilities.MULTISCALE, 5)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => target.isFullHp(), 0.5)
      .ignorable(),
    new Ability(Abilities.TOXIC_BOOST, 5)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.category === MoveCategory.PHYSICAL && (user?.status?.effect === StatusEffect.POISON || user?.status?.effect === StatusEffect.TOXIC), 1.5),
    new Ability(Abilities.FLARE_BOOST, 5)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.category === MoveCategory.SPECIAL && user?.status?.effect === StatusEffect.BURN, 1.5),
    new Ability(Abilities.HARVEST, 5)
      .attr(
        PostTurnLootAbAttr,
        "EATEN_BERRIES",
        /** Rate is doubled when under sun {@link https://dex.pokemonshowdown.com/abilities/harvest} */
        (pokemon) => 0.5 * (getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN)(pokemon) ? 2 : 1)
      )
      .edgeCase(), // Cannot recover berries used up by fling or natural gift (unimplemented)
    new Ability(Abilities.TELEPATHY, 5)
      .attr(MoveImmunityAbAttr, (pokemon, attacker, move) => pokemon.getAlly() === attacker && move instanceof AttackMove)
      .ignorable(),
    new Ability(Abilities.MOODY, 5)
      .attr(MoodyAbAttr),
    new Ability(Abilities.OVERCOAT, 5)
      .attr(BlockWeatherDamageAttr)
      .attr(MoveImmunityAbAttr, (pokemon, attacker, move) => pokemon !== attacker && move.hasFlag(MoveFlags.POWDER_MOVE))
      .ignorable(),
    new Ability(Abilities.POISON_TOUCH, 5)
      .attr(PostAttackContactApplyStatusEffectAbAttr, 30, StatusEffect.POISON),
    new Ability(Abilities.REGENERATOR, 5)
      .attr(PreSwitchOutHealAbAttr),
    new Ability(Abilities.BIG_PECKS, 5)
      .attr(ProtectStatAbAttr, Stat.DEF)
      .ignorable(),
    new Ability(Abilities.SAND_RUSH, 5)
      .attr(StatMultiplierAbAttr, Stat.SPD, 2)
      .attr(BlockWeatherDamageAttr, WeatherType.SANDSTORM)
      .condition(getWeatherCondition(WeatherType.SANDSTORM)),
    new Ability(Abilities.WONDER_SKIN, 5)
      .attr(WonderSkinAbAttr)
      .ignorable(),
    new Ability(Abilities.ANALYTIC, 5)
      .attr(MovePowerBoostAbAttr, (user, target, move) => {
        const movePhase = user?.scene.findPhase((phase) => phase instanceof MovePhase && phase.pokemon.id !== user.id);
        return Utils.isNullOrUndefined(movePhase);
      }, 1.3),
    new Ability(Abilities.ILLUSION, 5)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .unimplemented(),
    new Ability(Abilities.IMPOSTER, 5)
      .attr(PostSummonTransformAbAttr)
      .attr(UncopiableAbilityAbAttr),
    new Ability(Abilities.INFILTRATOR, 5)
      .attr(InfiltratorAbAttr)
      .partial(), // does not bypass Mist
    new Ability(Abilities.MUMMY, 5)
      .attr(PostDefendAbilityGiveAbAttr, Abilities.MUMMY)
      .bypassFaint(),
    new Ability(Abilities.MOXIE, 5)
      .attr(PostVictoryStatStageChangeAbAttr, Stat.ATK, 1),
    new Ability(Abilities.JUSTIFIED, 5)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => user.getMoveType(move) === Type.DARK && move.category !== MoveCategory.STATUS, Stat.ATK, 1),
    new Ability(Abilities.RATTLED, 5)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => {
        const moveType = user.getMoveType(move);
        return move.category !== MoveCategory.STATUS
          && (moveType === Type.DARK || moveType === Type.BUG || moveType === Type.GHOST);
      }, Stat.SPD, 1)
      .attr(PostIntimidateStatStageChangeAbAttr, [ Stat.SPD ], 1),
    new Ability(Abilities.MAGIC_BOUNCE, 5)
      .ignorable()
      .unimplemented(),
    new Ability(Abilities.SAP_SIPPER, 5)
      .attr(TypeImmunityStatStageChangeAbAttr, Type.GRASS, Stat.ATK, 1)
      .ignorable(),
    new Ability(Abilities.PRANKSTER, 5)
      .attr(ChangeMovePriorityAbAttr, (pokemon, move: Move) => move.category === MoveCategory.STATUS, 1),
    new Ability(Abilities.SAND_FORCE, 5)
      .attr(MoveTypePowerBoostAbAttr, Type.ROCK, 1.3)
      .attr(MoveTypePowerBoostAbAttr, Type.GROUND, 1.3)
      .attr(MoveTypePowerBoostAbAttr, Type.STEEL, 1.3)
      .attr(BlockWeatherDamageAttr, WeatherType.SANDSTORM)
      .condition(getWeatherCondition(WeatherType.SANDSTORM)),
    new Ability(Abilities.IRON_BARBS, 5)
      .attr(PostDefendContactDamageAbAttr, 8)
      .bypassFaint(),
    new Ability(Abilities.ZEN_MODE, 5)
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .attr(PostSummonFormChangeAbAttr, p => p.getHpRatio() <= 0.5 ? 1 : 0)
      .attr(PostTurnFormChangeAbAttr, p => p.getHpRatio() <= 0.5 ? 1 : 0)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .bypassFaint(),
    new Ability(Abilities.VICTORY_STAR, 5)
      .attr(StatMultiplierAbAttr, Stat.ACC, 1.1)
      .partial(), // Does not boost ally's accuracy
    new Ability(Abilities.TURBOBLAZE, 5)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonTurboblaze", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(MoveAbilityBypassAbAttr),
    new Ability(Abilities.TERAVOLT, 5)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonTeravolt", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(MoveAbilityBypassAbAttr),
    new Ability(Abilities.AROMA_VEIL, 6)
      .attr(UserFieldBattlerTagImmunityAbAttr, [ BattlerTagType.INFATUATED, BattlerTagType.TAUNT, BattlerTagType.DISABLED, BattlerTagType.TORMENT, BattlerTagType.HEAL_BLOCK ])
      .ignorable(),
    new Ability(Abilities.FLOWER_VEIL, 6)
      .ignorable()
      .unimplemented(),
    new Ability(Abilities.CHEEK_POUCH, 6)
      .attr(HealFromBerryUseAbAttr, 1 / 3),
    new Ability(Abilities.PROTEAN, 6)
      .attr(PokemonTypeChangeAbAttr),
    //.condition((p) => !p.summonData?.abilitiesApplied.includes(Abilities.PROTEAN)), //Gen 9 Implementation
    new Ability(Abilities.FUR_COAT, 6)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => move.category === MoveCategory.PHYSICAL, 0.5)
      .ignorable(),
    new Ability(Abilities.MAGICIAN, 6)
      .attr(PostAttackStealHeldItemAbAttr),
    new Ability(Abilities.BULLETPROOF, 6)
      .attr(MoveImmunityAbAttr, (pokemon, attacker, move) => pokemon !== attacker && move.hasFlag(MoveFlags.BALLBOMB_MOVE))
      .ignorable(),
    new Ability(Abilities.COMPETITIVE, 6)
      .attr(PostStatStageChangeStatStageChangeAbAttr, (target, statsChanged, stages) => stages < 0, [ Stat.SPATK ], 2),
    new Ability(Abilities.STRONG_JAW, 6)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.BITING_MOVE), 1.5),
    new Ability(Abilities.REFRIGERATE, 6)
      .attr(MoveTypeChangeAbAttr, Type.ICE, 1.2, (user, target, move) => move.type === Type.NORMAL && !move.hasAttr(VariableMoveTypeAttr)),
    new Ability(Abilities.SWEET_VEIL, 6)
      .attr(UserFieldStatusEffectImmunityAbAttr, StatusEffect.SLEEP)
      .attr(UserFieldBattlerTagImmunityAbAttr, BattlerTagType.DROWSY)
      .ignorable()
      .partial(), // Mold Breaker ally should not be affected by Sweet Veil
    new Ability(Abilities.STANCE_CHANGE, 6)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr),
    new Ability(Abilities.GALE_WINGS, 6)
      .attr(ChangeMovePriorityAbAttr, (pokemon, move) => pokemon.isFullHp() && pokemon.getMoveType(move) === Type.FLYING, 1),
    new Ability(Abilities.MEGA_LAUNCHER, 6)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.PULSE_MOVE), 1.5),
    new Ability(Abilities.GRASS_PELT, 6)
      .conditionalAttr(getTerrainCondition(TerrainType.GRASSY), StatMultiplierAbAttr, Stat.DEF, 1.5)
      .ignorable(),
    new Ability(Abilities.SYMBIOSIS, 6)
      .unimplemented(),
    new Ability(Abilities.TOUGH_CLAWS, 6)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.MAKES_CONTACT), 1.3),
    new Ability(Abilities.PIXILATE, 6)
      .attr(MoveTypeChangeAbAttr, Type.FAIRY, 1.2, (user, target, move) => move.type === Type.NORMAL && !move.hasAttr(VariableMoveTypeAttr)),
    new Ability(Abilities.GOOEY, 6)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.hasFlag(MoveFlags.MAKES_CONTACT), Stat.SPD, -1, false),
    new Ability(Abilities.AERILATE, 6)
      .attr(MoveTypeChangeAbAttr, Type.FLYING, 1.2, (user, target, move) => move.type === Type.NORMAL && !move.hasAttr(VariableMoveTypeAttr)),
    new Ability(Abilities.PARENTAL_BOND, 6)
      .attr(AddSecondStrikeAbAttr, 0.25),
    new Ability(Abilities.DARK_AURA, 6)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonDarkAura", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(FieldMoveTypePowerBoostAbAttr, Type.DARK, 4 / 3),
    new Ability(Abilities.FAIRY_AURA, 6)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonFairyAura", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(FieldMoveTypePowerBoostAbAttr, Type.FAIRY, 4 / 3),
    new Ability(Abilities.AURA_BREAK, 6)
      .ignorable()
      .conditionalAttr(pokemon => pokemon.scene.getField(true).some(p => p.hasAbility(Abilities.DARK_AURA)), FieldMoveTypePowerBoostAbAttr, Type.DARK, 9 / 16)
      .conditionalAttr(pokemon => pokemon.scene.getField(true).some(p => p.hasAbility(Abilities.FAIRY_AURA)), FieldMoveTypePowerBoostAbAttr, Type.FAIRY, 9 / 16)
      .conditionalAttr(pokemon => pokemon.scene.getField(true).some(p => p.hasAbility(Abilities.DARK_AURA) || p.hasAbility(Abilities.FAIRY_AURA)),
        PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonAuraBreak", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) })),
    new Ability(Abilities.PRIMORDIAL_SEA, 6)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.HEAVY_RAIN)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.HEAVY_RAIN)
      .attr(PreSwitchOutClearWeatherAbAttr)
      .attr(PostFaintClearWeatherAbAttr)
      .bypassFaint(),
    new Ability(Abilities.DESOLATE_LAND, 6)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.HARSH_SUN)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.HARSH_SUN)
      .attr(PreSwitchOutClearWeatherAbAttr)
      .attr(PostFaintClearWeatherAbAttr)
      .bypassFaint(),
    new Ability(Abilities.DELTA_STREAM, 6)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.STRONG_WINDS)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.STRONG_WINDS)
      .attr(PreSwitchOutClearWeatherAbAttr)
      .attr(PostFaintClearWeatherAbAttr)
      .bypassFaint(),
    new Ability(Abilities.STAMINA, 7)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, Stat.DEF, 1),
    new Ability(Abilities.WIMP_OUT, 7)
      .attr(PostDamageForceSwitchAbAttr)
      .edgeCase(), // Should not trigger when hurting itself in confusion, causes Fake Out to fail turn 1 and succeed turn 2 if pokemon is switched out before battle start via playing in Switch Mode
    new Ability(Abilities.EMERGENCY_EXIT, 7)
      .attr(PostDamageForceSwitchAbAttr)
      .edgeCase(), // Should not trigger when hurting itself in confusion, causes Fake Out to fail turn 1 and succeed turn 2 if pokemon is switched out before battle start via playing in Switch Mode
    new Ability(Abilities.WATER_COMPACTION, 7)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => user.getMoveType(move) === Type.WATER && move.category !== MoveCategory.STATUS, Stat.DEF, 2),
    new Ability(Abilities.MERCILESS, 7)
      .attr(ConditionalCritAbAttr, (user, target, move) => target?.status?.effect === StatusEffect.TOXIC || target?.status?.effect === StatusEffect.POISON),
    new Ability(Abilities.SHIELDS_DOWN, 7)
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .attr(PostSummonFormChangeAbAttr, p => p.formIndex % 7 + (p.getHpRatio() <= 0.5 ? 7 : 0))
      .attr(PostTurnFormChangeAbAttr, p => p.formIndex % 7 + (p.getHpRatio() <= 0.5 ? 7 : 0))
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .bypassFaint()
      .partial(), // Meteor form should protect against status effects and yawn
    new Ability(Abilities.STAKEOUT, 7)
      .attr(MovePowerBoostAbAttr, (user, target, move) => !!target?.turnData.switchedInThisTurn, 2),
    new Ability(Abilities.WATER_BUBBLE, 7)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.FIRE, 0.5)
      .attr(MoveTypePowerBoostAbAttr, Type.WATER, 2)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.BURN)
      .ignorable(),
    new Ability(Abilities.STEELWORKER, 7)
      .attr(MoveTypePowerBoostAbAttr, Type.STEEL),
    new Ability(Abilities.BERSERK, 7)
      .attr(PostDefendHpGatedStatStageChangeAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, 0.5, [ Stat.SPATK ], 1)
      .condition(getSheerForceHitDisableAbCondition()),
    new Ability(Abilities.SLUSH_RUSH, 7)
      .attr(StatMultiplierAbAttr, Stat.SPD, 2)
      .condition(getWeatherCondition(WeatherType.HAIL, WeatherType.SNOW)),
    new Ability(Abilities.LONG_REACH, 7)
      .attr(IgnoreContactAbAttr),
    new Ability(Abilities.LIQUID_VOICE, 7)
      .attr(MoveTypeChangeAbAttr, Type.WATER, 1, (user, target, move) => move.hasFlag(MoveFlags.SOUND_BASED)),
    new Ability(Abilities.TRIAGE, 7)
      .attr(ChangeMovePriorityAbAttr, (pokemon, move) => move.hasFlag(MoveFlags.TRIAGE_MOVE), 3),
    new Ability(Abilities.GALVANIZE, 7)
      .attr(MoveTypeChangeAbAttr, Type.ELECTRIC, 1.2, (user, target, move) => move.type === Type.NORMAL && !move.hasAttr(VariableMoveTypeAttr)),
    new Ability(Abilities.SURGE_SURFER, 7)
      .conditionalAttr(getTerrainCondition(TerrainType.ELECTRIC), StatMultiplierAbAttr, Stat.SPD, 2),
    new Ability(Abilities.SCHOOLING, 7)
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .attr(PostSummonFormChangeAbAttr, p => p.level < 20 || p.getHpRatio() <= 0.25 ? 0 : 1)
      .attr(PostTurnFormChangeAbAttr, p => p.level < 20 || p.getHpRatio() <= 0.25 ? 0 : 1)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .bypassFaint(),
    new Ability(Abilities.DISGUISE, 7)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      // Add BattlerTagType.DISGUISE if the pokemon is in its disguised form
      .conditionalAttr(pokemon => pokemon.formIndex === 0, PostSummonAddBattlerTagAbAttr, BattlerTagType.DISGUISE, 0, false)
      .attr(FormBlockDamageAbAttr,
        (target, user, move) => !!target.getTag(BattlerTagType.DISGUISE) && target.getMoveEffectiveness(user, move) > 0, 0, BattlerTagType.DISGUISE,
        (pokemon, abilityName) => i18next.t("abilityTriggers:disguiseAvoidedDamage", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName: abilityName }),
        (pokemon) => Utils.toDmgValue(pokemon.getMaxHp() / 8))
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .bypassFaint()
      .ignorable(),
    new Ability(Abilities.BATTLE_BOND, 7)
      .attr(PostVictoryFormChangeAbAttr, () => 2)
      .attr(PostBattleInitFormChangeAbAttr, () => 1)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .bypassFaint(),
    new Ability(Abilities.POWER_CONSTRUCT, 7)
      .conditionalAttr(pokemon => pokemon.formIndex === 2 || pokemon.formIndex === 4, PostBattleInitFormChangeAbAttr, () => 2)
      .conditionalAttr(pokemon => pokemon.formIndex === 3 || pokemon.formIndex === 5, PostBattleInitFormChangeAbAttr, () => 3)
      .conditionalAttr(pokemon => pokemon.formIndex === 2 || pokemon.formIndex === 4, PostSummonFormChangeAbAttr, p => p.getHpRatio() <= 0.5 || p.getFormKey() === "complete" ? 4 : 2)
      .conditionalAttr(pokemon => pokemon.formIndex === 2 || pokemon.formIndex === 4, PostTurnFormChangeAbAttr, p => p.getHpRatio() <= 0.5 || p.getFormKey() === "complete" ? 4 : 2)
      .conditionalAttr(pokemon => pokemon.formIndex === 3 || pokemon.formIndex === 5, PostSummonFormChangeAbAttr, p => p.getHpRatio() <= 0.5 || p.getFormKey() === "10-complete" ? 5 : 3)
      .conditionalAttr(pokemon => pokemon.formIndex === 3 || pokemon.formIndex === 5, PostTurnFormChangeAbAttr, p => p.getHpRatio() <= 0.5 || p.getFormKey() === "10-complete" ? 5 : 3)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .bypassFaint(),
    new Ability(Abilities.CORROSION, 7)
      .attr(IgnoreTypeStatusEffectImmunityAbAttr, [ StatusEffect.POISON, StatusEffect.TOXIC ], [ Type.STEEL, Type.POISON ])
      .edgeCase(), // Should interact correctly with magic coat/bounce (not yet implemented) + fling with toxic orb (not implemented yet)
    new Ability(Abilities.COMATOSE, 7)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(StatusEffectImmunityAbAttr, ...getNonVolatileStatusEffects())
      .attr(BattlerTagImmunityAbAttr, BattlerTagType.DROWSY),
    new Ability(Abilities.QUEENLY_MAJESTY, 7)
      .attr(FieldPriorityMoveImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.INNARDS_OUT, 7)
      .attr(PostFaintHPDamageAbAttr)
      .bypassFaint(),
    new Ability(Abilities.DANCER, 7)
      .attr(PostDancingMoveAbAttr),
    new Ability(Abilities.BATTERY, 7)
      .attr(AllyMoveCategoryPowerBoostAbAttr, [ MoveCategory.SPECIAL ], 1.3),
    new Ability(Abilities.FLUFFY, 7)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => move.hasFlag(MoveFlags.MAKES_CONTACT), 0.5)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => user.getMoveType(move) === Type.FIRE, 2)
      .ignorable(),
    new Ability(Abilities.DAZZLING, 7)
      .attr(FieldPriorityMoveImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.SOUL_HEART, 7)
      .attr(PostKnockOutStatStageChangeAbAttr, Stat.SPATK, 1),
    new Ability(Abilities.TANGLING_HAIR, 7)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.hasFlag(MoveFlags.MAKES_CONTACT), Stat.SPD, -1, false),
    new Ability(Abilities.RECEIVER, 7)
      .attr(CopyFaintedAllyAbilityAbAttr)
      .attr(UncopiableAbilityAbAttr),
    new Ability(Abilities.POWER_OF_ALCHEMY, 7)
      .attr(CopyFaintedAllyAbilityAbAttr)
      .attr(UncopiableAbilityAbAttr),
    new Ability(Abilities.BEAST_BOOST, 7)
      .attr(PostVictoryStatStageChangeAbAttr, p => {
        let highestStat: EffectiveStat;
        let highestValue = 0;
        for (const s of EFFECTIVE_STATS) {
          const value = p.getStat(s, false);
          if (value > highestValue) {
            highestStat = s;
            highestValue = value;
          }
        }
        return highestStat!;
      }, 1),
    new Ability(Abilities.RKS_SYSTEM, 7)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr),
    new Ability(Abilities.ELECTRIC_SURGE, 7)
      .attr(PostSummonTerrainChangeAbAttr, TerrainType.ELECTRIC)
      .attr(PostBiomeChangeTerrainChangeAbAttr, TerrainType.ELECTRIC),
    new Ability(Abilities.PSYCHIC_SURGE, 7)
      .attr(PostSummonTerrainChangeAbAttr, TerrainType.PSYCHIC)
      .attr(PostBiomeChangeTerrainChangeAbAttr, TerrainType.PSYCHIC),
    new Ability(Abilities.MISTY_SURGE, 7)
      .attr(PostSummonTerrainChangeAbAttr, TerrainType.MISTY)
      .attr(PostBiomeChangeTerrainChangeAbAttr, TerrainType.MISTY),
    new Ability(Abilities.GRASSY_SURGE, 7)
      .attr(PostSummonTerrainChangeAbAttr, TerrainType.GRASSY)
      .attr(PostBiomeChangeTerrainChangeAbAttr, TerrainType.GRASSY),
    new Ability(Abilities.FULL_METAL_BODY, 7)
      .attr(ProtectStatAbAttr),
    new Ability(Abilities.SHADOW_SHIELD, 7)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => target.isFullHp(), 0.5),
    new Ability(Abilities.PRISM_ARMOR, 7)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => target.getMoveEffectiveness(user, move) >= 2, 0.75),
    new Ability(Abilities.NEUROFORCE, 7)
      .attr(MovePowerBoostAbAttr, (user, target, move) => (target?.getMoveEffectiveness(user!, move) ?? 1) >= 2, 1.25),
    new Ability(Abilities.INTREPID_SWORD, 8)
      .attr(PostSummonStatStageChangeAbAttr, [ Stat.ATK ], 1, true),
    new Ability(Abilities.DAUNTLESS_SHIELD, 8)
      .attr(PostSummonStatStageChangeAbAttr, [ Stat.DEF ], 1, true),
    new Ability(Abilities.LIBERO, 8)
      .attr(PokemonTypeChangeAbAttr),
    //.condition((p) => !p.summonData?.abilitiesApplied.includes(Abilities.LIBERO)), //Gen 9 Implementation
    new Ability(Abilities.BALL_FETCH, 8)
      .attr(FetchBallAbAttr)
      .condition(getOncePerBattleCondition(Abilities.BALL_FETCH)),
    new Ability(Abilities.COTTON_DOWN, 8)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, Stat.SPD, -1, false, true)
      .bypassFaint(),
    new Ability(Abilities.PROPELLER_TAIL, 8)
      .attr(BlockRedirectAbAttr),
    new Ability(Abilities.MIRROR_ARMOR, 8)
      .ignorable()
      .unimplemented(),
    /**
     * Right now, the logic is attached to Surf and Dive moves. Ideally, the post-defend/hit should be an
     * ability attribute but the current implementation of move effects for BattlerTag does not support this- in the case
     * where Cramorant is fainted.
     * @see {@linkcode GulpMissileTagAttr} and {@linkcode GulpMissileTag} for Gulp Missile implementation
     */
    new Ability(Abilities.GULP_MISSILE, 8)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .bypassFaint(),
    new Ability(Abilities.STALWART, 8)
      .attr(BlockRedirectAbAttr),
    new Ability(Abilities.STEAM_ENGINE, 8)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => {
        const moveType = user.getMoveType(move);
        return move.category !== MoveCategory.STATUS
          && (moveType === Type.FIRE || moveType === Type.WATER);
      }, Stat.SPD, 6),
    new Ability(Abilities.PUNK_ROCK, 8)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.SOUND_BASED), 1.3)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => move.hasFlag(MoveFlags.SOUND_BASED), 0.5)
      .ignorable(),
    new Ability(Abilities.SAND_SPIT, 8)
      .attr(PostDefendWeatherChangeAbAttr, WeatherType.SANDSTORM, (target, user, move) => move.category !== MoveCategory.STATUS),
    new Ability(Abilities.ICE_SCALES, 8)
      .attr(ReceivedMoveDamageMultiplierAbAttr, (target, user, move) => move.category === MoveCategory.SPECIAL, 0.5)
      .ignorable(),
    new Ability(Abilities.RIPEN, 8)
      .attr(DoubleBerryEffectAbAttr),
    new Ability(Abilities.ICE_FACE, 8)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      // Add BattlerTagType.ICE_FACE if the pokemon is in ice face form
      .conditionalAttr(pokemon => pokemon.formIndex === 0, PostSummonAddBattlerTagAbAttr, BattlerTagType.ICE_FACE, 0, false)
      // When summoned with active HAIL or SNOW, add BattlerTagType.ICE_FACE
      .conditionalAttr(getWeatherCondition(WeatherType.HAIL, WeatherType.SNOW), PostSummonAddBattlerTagAbAttr, BattlerTagType.ICE_FACE, 0)
      // When weather changes to HAIL or SNOW while pokemon is fielded, add BattlerTagType.ICE_FACE
      .attr(PostWeatherChangeAddBattlerTagAttr, BattlerTagType.ICE_FACE, 0, WeatherType.HAIL, WeatherType.SNOW)
      .attr(FormBlockDamageAbAttr,
        (target, user, move) => move.category === MoveCategory.PHYSICAL && !!target.getTag(BattlerTagType.ICE_FACE), 0, BattlerTagType.ICE_FACE,
        (pokemon, abilityName) => i18next.t("abilityTriggers:iceFaceAvoidedDamage", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon), abilityName: abilityName }))
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .bypassFaint()
      .ignorable(),
    new Ability(Abilities.POWER_SPOT, 8)
      .attr(AllyMoveCategoryPowerBoostAbAttr, [ MoveCategory.SPECIAL, MoveCategory.PHYSICAL ], 1.3),
    new Ability(Abilities.MIMICRY, 8)
      .attr(TerrainEventTypeChangeAbAttr),
    new Ability(Abilities.SCREEN_CLEANER, 8)
      .attr(PostSummonRemoveArenaTagAbAttr, [ ArenaTagType.AURORA_VEIL, ArenaTagType.LIGHT_SCREEN, ArenaTagType.REFLECT ]),
    new Ability(Abilities.STEELY_SPIRIT, 8)
      .attr(UserFieldMoveTypePowerBoostAbAttr, Type.STEEL),
    new Ability(Abilities.PERISH_BODY, 8)
      .attr(PostDefendPerishSongAbAttr, 4),
    new Ability(Abilities.WANDERING_SPIRIT, 8)
      .attr(PostDefendAbilitySwapAbAttr)
      .bypassFaint()
      .edgeCase(), //  interacts incorrectly with rock head. It's meant to switch abilities before recoil would apply so that a pokemon with rock head would lose rock head first and still take the recoil
    new Ability(Abilities.GORILLA_TACTICS, 8)
      .attr(GorillaTacticsAbAttr),
    new Ability(Abilities.NEUTRALIZING_GAS, 8)
      .attr(SuppressFieldAbilitiesAbAttr)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonNeutralizingGas", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .partial(), // A bunch of weird interactions with other abilities being suppressed then unsuppressed
    new Ability(Abilities.PASTEL_VEIL, 8)
      .attr(PostSummonUserFieldRemoveStatusEffectAbAttr, StatusEffect.POISON, StatusEffect.TOXIC)
      .attr(UserFieldStatusEffectImmunityAbAttr, StatusEffect.POISON, StatusEffect.TOXIC)
      .ignorable(),
    new Ability(Abilities.HUNGER_SWITCH, 8)
      .attr(PostTurnFormChangeAbAttr, p => p.getFormKey() ? 0 : 1)
      .attr(PostTurnFormChangeAbAttr, p => p.getFormKey() ? 1 : 0)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .condition((pokemon) => !pokemon.isTerastallized()),
    new Ability(Abilities.QUICK_DRAW, 8)
      .attr(BypassSpeedChanceAbAttr, 30),
    new Ability(Abilities.UNSEEN_FIST, 8)
      .attr(IgnoreProtectOnContactAbAttr),
    new Ability(Abilities.CURIOUS_MEDICINE, 8)
      .attr(PostSummonClearAllyStatStagesAbAttr),
    new Ability(Abilities.TRANSISTOR, 8)
      .attr(MoveTypePowerBoostAbAttr, Type.ELECTRIC),
    new Ability(Abilities.DRAGONS_MAW, 8)
      .attr(MoveTypePowerBoostAbAttr, Type.DRAGON),
    new Ability(Abilities.CHILLING_NEIGH, 8)
      .attr(PostVictoryStatStageChangeAbAttr, Stat.ATK, 1),
    new Ability(Abilities.GRIM_NEIGH, 8)
      .attr(PostVictoryStatStageChangeAbAttr, Stat.SPATK, 1),
    new Ability(Abilities.AS_ONE_GLASTRIER, 8)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonAsOneGlastrier", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(PreventBerryUseAbAttr)
      .attr(PostVictoryStatStageChangeAbAttr, Stat.ATK, 1)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr),
    new Ability(Abilities.AS_ONE_SPECTRIER, 8)
      .attr(PostSummonMessageAbAttr, (pokemon: Pokemon) => i18next.t("abilityTriggers:postSummonAsOneSpectrier", { pokemonNameWithAffix: getPokemonNameWithAffix(pokemon) }))
      .attr(PreventBerryUseAbAttr)
      .attr(PostVictoryStatStageChangeAbAttr, Stat.SPATK, 1)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr),
    new Ability(Abilities.LINGERING_AROMA, 9)
      .attr(PostDefendAbilityGiveAbAttr, Abilities.LINGERING_AROMA)
      .bypassFaint(),
    new Ability(Abilities.SEED_SOWER, 9)
      .attr(PostDefendTerrainChangeAbAttr, TerrainType.GRASSY),
    new Ability(Abilities.THERMAL_EXCHANGE, 9)
      .attr(PostDefendStatStageChangeAbAttr, (target, user, move) => user.getMoveType(move) === Type.FIRE && move.category !== MoveCategory.STATUS, Stat.ATK, 1)
      .attr(StatusEffectImmunityAbAttr, StatusEffect.BURN)
      .ignorable(),
    new Ability(Abilities.ANGER_SHELL, 9)
      .attr(PostDefendHpGatedStatStageChangeAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, 0.5, [ Stat.ATK, Stat.SPATK, Stat.SPD ], 1)
      .attr(PostDefendHpGatedStatStageChangeAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, 0.5, [ Stat.DEF, Stat.SPDEF ], -1)
      .condition(getSheerForceHitDisableAbCondition()),
    new Ability(Abilities.PURIFYING_SALT, 9)
      .attr(StatusEffectImmunityAbAttr)
      .attr(ReceivedTypeDamageMultiplierAbAttr, Type.GHOST, 0.5)
      .ignorable(),
    new Ability(Abilities.WELL_BAKED_BODY, 9)
      .attr(TypeImmunityStatStageChangeAbAttr, Type.FIRE, Stat.DEF, 2)
      .ignorable(),
    new Ability(Abilities.WIND_RIDER, 9)
      .attr(MoveImmunityStatStageChangeAbAttr, (pokemon, attacker, move) => pokemon !== attacker && move.hasFlag(MoveFlags.WIND_MOVE) && move.category !== MoveCategory.STATUS, Stat.ATK, 1)
      .attr(PostSummonStatStageChangeOnArenaAbAttr, ArenaTagType.TAILWIND)
      .ignorable(),
    new Ability(Abilities.GUARD_DOG, 9)
      .attr(PostIntimidateStatStageChangeAbAttr, [ Stat.ATK ], 1, true)
      .attr(ForceSwitchOutImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.ROCKY_PAYLOAD, 9)
      .attr(MoveTypePowerBoostAbAttr, Type.ROCK),
    new Ability(Abilities.WIND_POWER, 9)
      .attr(PostDefendApplyBattlerTagAbAttr, (target, user, move) => move.hasFlag(MoveFlags.WIND_MOVE), BattlerTagType.CHARGED),
    new Ability(Abilities.ZERO_TO_HERO, 9)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr)
      .attr(PostBattleInitFormChangeAbAttr, () => 0)
      .attr(PreSwitchOutFormChangeAbAttr, (pokemon) => !pokemon.isFainted() ? 1 : pokemon.formIndex)
      .bypassFaint(),
    new Ability(Abilities.COMMANDER, 9)
      .attr(CommanderAbAttr)
      .attr(DoubleBattleChanceAbAttr)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .edgeCase(), // Encore, Frenzy, and other non-`TURN_END` tags don't lapse correctly on the commanding Pokemon.
    new Ability(Abilities.ELECTROMORPHOSIS, 9)
      .attr(PostDefendApplyBattlerTagAbAttr, (target, user, move) => move.category !== MoveCategory.STATUS, BattlerTagType.CHARGED),
    new Ability(Abilities.PROTOSYNTHESIS, 9)
      .conditionalAttr(getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN), PostSummonAddBattlerTagAbAttr, BattlerTagType.PROTOSYNTHESIS, 0, true)
      .attr(PostWeatherChangeAddBattlerTagAttr, BattlerTagType.PROTOSYNTHESIS, 0, WeatherType.SUNNY, WeatherType.HARSH_SUN)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(), // While setting the tag, the getbattlestat should ignore all modifiers to stats except stat stages
    new Ability(Abilities.QUARK_DRIVE, 9)
      .conditionalAttr(getTerrainCondition(TerrainType.ELECTRIC), PostSummonAddBattlerTagAbAttr, BattlerTagType.QUARK_DRIVE, 0, true)
      .attr(PostTerrainChangeAddBattlerTagAttr, BattlerTagType.QUARK_DRIVE, 0, TerrainType.ELECTRIC)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(), // While setting the tag, the getbattlestat should ignore all modifiers to stats except stat stages
    new Ability(Abilities.GOOD_AS_GOLD, 9)
      .attr(MoveImmunityAbAttr, (pokemon, attacker, move) => pokemon !== attacker && move.category === MoveCategory.STATUS)
      .ignorable()
      .partial(), // Lots of weird interactions with moves and abilities such as negating status moves that target the field
    new Ability(Abilities.VESSEL_OF_RUIN, 9)
      .attr(FieldMultiplyStatAbAttr, Stat.SPATK, 0.75)
      .attr(PostSummonMessageAbAttr, (user) => i18next.t("abilityTriggers:postSummonVesselOfRuin", { pokemonNameWithAffix: getPokemonNameWithAffix(user), statName: i18next.t(getStatKey(Stat.SPATK)) }))
      .ignorable(),
    new Ability(Abilities.SWORD_OF_RUIN, 9)
      .attr(FieldMultiplyStatAbAttr, Stat.DEF, 0.75)
      .attr(PostSummonMessageAbAttr, (user) => i18next.t("abilityTriggers:postSummonSwordOfRuin", { pokemonNameWithAffix: getPokemonNameWithAffix(user), statName: i18next.t(getStatKey(Stat.DEF)) })),
    new Ability(Abilities.TABLETS_OF_RUIN, 9)
      .attr(FieldMultiplyStatAbAttr, Stat.ATK, 0.75)
      .attr(PostSummonMessageAbAttr, (user) => i18next.t("abilityTriggers:postSummonTabletsOfRuin", { pokemonNameWithAffix: getPokemonNameWithAffix(user), statName: i18next.t(getStatKey(Stat.ATK)) }))
      .ignorable(),
    new Ability(Abilities.BEADS_OF_RUIN, 9)
      .attr(FieldMultiplyStatAbAttr, Stat.SPDEF, 0.75)
      .attr(PostSummonMessageAbAttr, (user) => i18next.t("abilityTriggers:postSummonBeadsOfRuin", { pokemonNameWithAffix: getPokemonNameWithAffix(user), statName: i18next.t(getStatKey(Stat.SPDEF)) })),
    new Ability(Abilities.ORICHALCUM_PULSE, 9)
      .attr(PostSummonWeatherChangeAbAttr, WeatherType.SUNNY)
      .attr(PostBiomeChangeWeatherChangeAbAttr, WeatherType.SUNNY)
      .conditionalAttr(getWeatherCondition(WeatherType.SUNNY, WeatherType.HARSH_SUN), StatMultiplierAbAttr, Stat.ATK, 4 / 3),
    new Ability(Abilities.HADRON_ENGINE, 9)
      .attr(PostSummonTerrainChangeAbAttr, TerrainType.ELECTRIC)
      .attr(PostBiomeChangeTerrainChangeAbAttr, TerrainType.ELECTRIC)
      .conditionalAttr(getTerrainCondition(TerrainType.ELECTRIC), StatMultiplierAbAttr, Stat.SPATK, 4 / 3),
    new Ability(Abilities.OPPORTUNIST, 9)
      .attr(StatStageChangeCopyAbAttr),
    new Ability(Abilities.CUD_CHEW, 9)
      .unimplemented(),
    new Ability(Abilities.SHARPNESS, 9)
      .attr(MovePowerBoostAbAttr, (user, target, move) => move.hasFlag(MoveFlags.SLICING_MOVE), 1.5),
    new Ability(Abilities.SUPREME_OVERLORD, 9)
      .attr(VariableMovePowerBoostAbAttr, (user, target, move) => 1 + 0.1 * Math.min(user.isPlayer() ? user.scene.currentBattle.playerFaints : user.scene.currentBattle.enemyFaints, 5))
      .partial(), // Counter resets every wave instead of on arena reset
    new Ability(Abilities.COSTAR, 9)
      .attr(PostSummonCopyAllyStatsAbAttr),
    new Ability(Abilities.TOXIC_DEBRIS, 9)
      .attr(PostDefendApplyArenaTrapTagAbAttr, (target, user, move) => move.category === MoveCategory.PHYSICAL, ArenaTagType.TOXIC_SPIKES)
      .bypassFaint(),
    new Ability(Abilities.ARMOR_TAIL, 9)
      .attr(FieldPriorityMoveImmunityAbAttr)
      .ignorable(),
    new Ability(Abilities.EARTH_EATER, 9)
      .attr(TypeImmunityHealAbAttr, Type.GROUND)
      .ignorable(),
    new Ability(Abilities.MYCELIUM_MIGHT, 9)
      .attr(ChangeMovePriorityAbAttr, (pokemon, move) => move.category === MoveCategory.STATUS, -0.2)
      .attr(PreventBypassSpeedChanceAbAttr, (pokemon, move) => move.category === MoveCategory.STATUS)
      .attr(MoveAbilityBypassAbAttr, (pokemon, move: Move) => move.category === MoveCategory.STATUS),
    new Ability(Abilities.MINDS_EYE, 9)
      .attr(IgnoreTypeImmunityAbAttr, Type.GHOST, [ Type.NORMAL, Type.FIGHTING ])
      .attr(ProtectStatAbAttr, Stat.ACC)
      .attr(IgnoreOpponentStatStagesAbAttr, [ Stat.EVA ])
      .ignorable(),
    new Ability(Abilities.SUPERSWEET_SYRUP, 9)
      .attr(PostSummonStatStageChangeAbAttr, [ Stat.EVA ], -1),
    new Ability(Abilities.HOSPITALITY, 9)
      .attr(PostSummonAllyHealAbAttr, 4, true),
    new Ability(Abilities.TOXIC_CHAIN, 9)
      .attr(PostAttackApplyStatusEffectAbAttr, false, 30, StatusEffect.TOXIC),
    new Ability(Abilities.EMBODY_ASPECT_TEAL, 9)
      .attr(PostBattleInitStatStageChangeAbAttr, [ Stat.SPD ], 1, true)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(), // Ogerpon tera interactions
    new Ability(Abilities.EMBODY_ASPECT_WELLSPRING, 9)
      .attr(PostBattleInitStatStageChangeAbAttr, [ Stat.SPDEF ], 1, true)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(),  // Ogerpon tera interactions
    new Ability(Abilities.EMBODY_ASPECT_HEARTHFLAME, 9)
      .attr(PostBattleInitStatStageChangeAbAttr, [ Stat.ATK ], 1, true)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(),  // Ogerpon tera interactions
    new Ability(Abilities.EMBODY_ASPECT_CORNERSTONE, 9)
      .attr(PostBattleInitStatStageChangeAbAttr, [ Stat.DEF ], 1, true)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .partial(),  // Ogerpon tera interactions
    new Ability(Abilities.TERA_SHIFT, 9)
      .attr(PostSummonFormChangeAbAttr, p => p.getFormKey() ? 0 : 1)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(UnsuppressableAbilityAbAttr)
      .attr(NoTransformAbilityAbAttr)
      .attr(NoFusionAbilityAbAttr),
    new Ability(Abilities.TERA_SHELL, 9)
      .attr(FullHpResistTypeAbAttr)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .ignorable(),
    new Ability(Abilities.TERAFORM_ZERO, 9)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .unimplemented(),
    new Ability(Abilities.POISON_PUPPETEER, 9)
      .attr(UncopiableAbilityAbAttr)
      .attr(UnswappableAbilityAbAttr)
      .attr(ConfusionOnStatusEffectAbAttr, StatusEffect.POISON, StatusEffect.TOXIC)
  );
}