import { Actuator, B3Object, B3Engine } from './index';

/**
 * CombatActuator: Triggers the engine's CombatManager to fire a weapon.
 * This node handles the actual "Firing" event based on input.
 */
export class CombatActuator extends Actuator {
    getTypeName() { return 'CombatActuator'; }
    constructor() {
        super();
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (!b3obj.isWeapon) return;
        engine.combat.fireWeapon(b3obj);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'CombatActuator'
        };
    }
}
