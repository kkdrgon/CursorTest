import { createArcherAbility } from "./archer.js";
import { createWarriorAbility } from "./warrior.js";
import { createMageAbilities } from "./mage.js";

export function createAbilityRegistry(context) {
  const abilities = [
    createArcherAbility(context),
    createWarriorAbility(context),
    ...createMageAbilities(context),
  ];

  return abilities;
}
