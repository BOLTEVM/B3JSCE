import { Actuator, B3ObjectRef, B3EngineRef } from './base';
import { registerActuatorType } from '../core/registry';

/**
 * LovenseActuator: Triggers Lovense toy actions from the logic editor.
 */
export class LovenseActuator extends Actuator {
    constructor(
        public commandType: 'vibrate' | 'rotate' | 'air' | 'linear' | 'pattern' = 'vibrate',
        public intensity: number = 0.5,
        public patternName: string = '',
        public targetToyId: string = ''
    ) {
        super();
    }

    getTypeName() { return 'LovenseActuator'; }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!engine.lovense) return;

        const level = this.intensity * 20;

        if (this.commandType === 'pattern' && this.patternName) {
            const pattern = this.getPatternString(this.patternName);
            engine.lovense.playPattern(pattern, this.targetToyId);
        } else {
            engine.lovense.sendCommand(this.commandType, level, this.targetToyId);
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        // Passive: only executes when triggered by a controller
    }

    private getPatternString(name: string): string {
        const presets: Record<string, string> = {
            'Solace_Deep': '80;20;90;30;100;40',
            'Solace_Pulse': '0;100;0;100;0;100',
            'Machine_Fast': '100;100;100;100',
            'Machine_Rhythm': '50;80;100;80;50;20',
            'Nora_Wave': '20;40;60;80;100;80;60;40;20'
        };
        return presets[name] || name;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'LovenseActuator',
            commandType: this.commandType,
            intensity: this.intensity,
            patternName: this.patternName,
            targetToyId: this.targetToyId
        };
    }

    static fromJSON(data: any): LovenseActuator {
        const n = new LovenseActuator(
            data.commandType,
            data.intensity,
            data.patternName,
            data.targetToyId
        );
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

// Auto-register during module load
registerActuatorType('LovenseActuator', (data) => LovenseActuator.fromJSON(data));
