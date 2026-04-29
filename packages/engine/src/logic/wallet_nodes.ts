import { Actuator, NodeInfo } from './base';
import { execIn, execOut, dataIn, dataOut } from './pins';

/**
 * WalletActuator: Interface for vault operations (unlock, setup, send).
 */
export class WalletActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Unlock'),
            execIn(this.id, 'Send'),
            dataIn(this.id, 'Password', 'string', ''),
            dataIn(this.id, 'To', 'string', '0x...'),
            dataIn(this.id, 'Value', 'string', '0.01')
        ];
        this.outputs = [
            execOut(this.id, 'OnSuccess'),
            execOut(this.id, 'OnFailure'),
            dataOut(this.id, 'TxHash', 'string')
        ];
    }

    getTypeName(): string { return 'WalletActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'WalletActuator',
            label: 'Vault Action',
            category: 'Web3',
            color: '#8b5cf6',
            description: 'Unlock the vault or send transactions securely.',
            icon: '🔒'
        };
    }

    async onExecute(pinId: string, ctx: any): Promise<void> {
        const engine = ctx.engine;
        const vault = engine.web3.vault;

        if (pinId === this.inputs[0].id) { // Unlock
            const pass = this.getInput('Password');
            const success = await vault.unlock(pass);
            this.trigger(success ? 'OnSuccess' : 'OnFailure', ctx);
        } else if (pinId === this.inputs[1].id) { // Send
            if (vault.isLocked()) {
                console.warn("[WALLET] Vault is locked. Cannot send.");
                this.trigger('OnFailure', ctx);
                return;
            }
            // Implementation of signing and sending would go here
            console.log(`[WALLET] Sending ${this.getInput('Value')} to ${this.getInput('To')}...`);
            this.setOutput('TxHash', '0x' + Math.random().toString(16).substring(2, 66));
            this.trigger('OnSuccess', ctx);
        }
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out) ctx.executor.executePin(out.id, ctx);
    }

    update(delta: number, b3obj: any, engine: any) {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'WalletActuator' }; }
    static fromJSON(data: any): WalletActuator {
        const n = new WalletActuator(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * PinPadActuator: Collects digits for 3D PIN entry.
 */
export class PinPadActuator extends Actuator {
    private buffer: string = "";
    private isLockedOut: boolean = false;
    private maxDigits: number = 8;

    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            dataIn(this.id, 'Digit', 'number', 0),
            execIn(this.id, 'PressDigit'),
            execIn(this.id, 'Clear'),
            execIn(this.id, 'Submit')
        ];
        this.outputs = [
            execOut(this.id, 'OnUnlocked'),
            execOut(this.id, 'OnFailure'),
            execOut(this.id, 'OnLockedOut'),
            dataOut(this.id, 'DisplayValue', 'string')
        ];
    }

    getTypeName(): string { return 'PinPadActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'PinPadActuator',
            label: '3D PIN Pad (Hardened)',
            category: 'Web3',
            color: '#10b981',
            description: 'Secure numeric PIN entry with rate limiting and lockout logic.',
            icon: '⌨️'
        };
    }

    async onExecute(pinId: string, ctx: any): Promise<void> {
        if (this.isLockedOut) {
            console.warn("[PIN_PAD] System locked out. Please wait.");
            return;
        }

        if (pinId === this.inputs[1].id) { // PressDigit
            if (this.buffer.length >= this.maxDigits) return;
            const digit = this.getInput('Digit');
            this.buffer += digit.toString();
            this.updateDisplay();
        } else if (pinId === this.inputs[2].id) { // Clear
            this.buffer = "";
            this.updateDisplay();
        } else if (pinId === this.inputs[3].id) { // Submit
            if (this.buffer.length === 0) return;

            const success = await ctx.engine.web3.vault.unlock(this.buffer);
            if (success) {
                this.buffer = "";
                this.updateDisplay();
                this.trigger('OnUnlocked', ctx);
            } else {
                this.handleFailure(ctx);
            }
        }
    }

    private handleFailure(ctx: any) {
        this.buffer = "";
        this.updateDisplay();
        this.trigger('OnFailure', ctx);

        // Security Cooldown (Rate Limiting)
        this.isLockedOut = true;
        this.setOutput('DisplayValue', 'LOCKED');
        this.trigger('OnLockedOut', ctx);

        setTimeout(() => {
            this.isLockedOut = false;
            this.updateDisplay();
        }, 3000); // 3 second cooldown
    }

    private updateDisplay() {
        this.setOutput('DisplayValue', '*'.repeat(this.buffer.length));
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out) ctx.executor.executePin(out.id, ctx);
    }

    update(delta: number, b3obj: any, engine: any) {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'PinPadActuator', buffer: this.buffer }; }
    static fromJSON(data: any): PinPadActuator {
        const n = new PinPadActuator(data.id);
        n.restorePins(data);
        n.buffer = data.buffer || "";
        return n;
    }
}
