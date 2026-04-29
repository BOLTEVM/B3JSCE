import { Actuator, Sensor, B3ObjectRef, B3EngineRef, NodeInfo } from './base';
import { execIn, execOut, dataIn, dataOut } from './pins';
import { OrderSide, Order } from '../economics';
import { nanoid } from 'nanoid';

/**
 * OrderbookActuator: Places orders on the internal BDelta matching engine.
 */
export class OrderbookActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Place'),
            dataIn(this.id, 'MarketID', 'string', 'BOLT-USDC'),
            dataIn(this.id, 'Side', 'string', 'BUY'),
            dataIn(this.id, 'Price', 'string', '1000'),
            dataIn(this.id, 'Amount', 'string', '1.0')
        ];
        this.outputs = [
            execOut(this.id, 'OnPlaced'),
            dataOut(this.id, 'OrderID', 'string')
        ];
    }

    getTypeName(): string { return 'OrderbookActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'OrderbookActuator',
            label: 'Orderbook Trade',
            category: 'Economics',
            color: '#00cc66',
            description: 'Place a limit order on the BDelta matching engine.',
            icon: '📊'
        };
    }

    onExecute(pinId: string, ctx: any): void {
        if (pinId === this.inputs[0].id) {
            const engine = ctx.engine;
            const marketId = this.getInput('MarketID');
            const sideStr = this.getInput('Side');
            const side = sideStr === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
            const price = BigInt(this.getInput('Price'));
            const amount = BigInt(this.getInput('Amount') || "1");
            
            const orderId = nanoid();
            const order: Order = {
                id: orderId,
                price,
                amount,
                side,
                timestamp: Date.now(),
                userId: 'player-1',
                marketId
            };

            engine.economics.placeOrder(marketId, order);
            this.setOutput('OrderID', orderId);
            
            // Trigger downstream
            const out = this.outputs.find(o => o.dataType === 'exec');
            if (out) ctx.executor.executePin(out.id, ctx);
        }
    }

    update() {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'OrderbookActuator' }; }
    static fromJSON(data: any): OrderbookActuator {
        const n = new OrderbookActuator(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * ContractActuator: Executes on-chain smart contract methods.
 */
export class ContractActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Call'),
            dataIn(this.id, 'ContractName', 'string', 'Vault'),
            dataIn(this.id, 'Method', 'string', 'deposit'),
            dataIn(this.id, 'Args', 'string', '[]'),
            dataIn(this.id, 'Value', 'string', '0')
        ];
        this.outputs = [
            execOut(this.id, 'OnTxSent'),
            dataOut(this.id, 'TxHash', 'string')
        ];
    }

    getTypeName(): string { return 'ContractActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ContractActuator',
            label: 'Contract Call',
            category: 'Web3',
            color: '#6366f1',
            description: 'Execute a smart contract method on Ethereum/EVM.',
            icon: '📜'
        };
    }

    onExecute(pinId: string, ctx: any): void {
        if (pinId === this.inputs[0].id) {
            const engine = ctx.engine;
            const contractName = this.getInput('ContractName');
            const method = this.getInput('Method');
            const args = JSON.parse(this.getInput('Args') || '[]');
            const value = this.getInput('Value');

            const contract = engine.web3.contracts.get(contractName);
            if (!contract) {
                console.error(`[WEB3] Contract not found in registry: ${contractName}`);
                return;
            }

            console.log(`[WEB3] Calling ${contractName}.${method} with args:`, args);
            // Simulated Tx
            const txHash = '0x' + nanoid(64);
            this.setOutput('TxHash', txHash);
            
            const out = this.outputs.find(o => o.dataType === 'exec');
            if (out) ctx.executor.executePin(out.id, ctx);
        }
    }

    update() {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'ContractActuator' }; }
    static fromJSON(data: any): ContractActuator {
        const n = new ContractActuator(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * EventSensor: Listens for on-chain events via the ContractRegistry.
 */
export class EventSensor extends Sensor {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            dataIn(this.id, 'ContractName', 'string', 'Vault'),
            dataIn(this.id, 'EventName', 'string', 'Deposit')
        ];
        this.outputs = [
            execOut(this.id, 'OnEvent'),
            dataOut(this.id, 'Data', 'string')
        ];
    }

    getTypeName(): string { return 'EventSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'EventSensor',
            label: 'Contract Event',
            category: 'Web3',
            color: '#f59e0b',
            description: 'Triggered when a smart contract event is fired.',
            icon: '🔔'
        };
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        // In a real implementation, this would subscribe to a provider.
        // For now, we simulate event detection.
    }

    toJSON() { return { ...super.toJSON(), type: 'EventSensor' }; }
    static fromJSON(data: any): EventSensor {
        const n = new EventSensor(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * ShopActuator: Handles buying/selling from a registered Vendor.
 */
export class ShopActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Buy'),
            dataIn(this.id, 'VendorID', 'string', 'default-merchant'),
            dataIn(this.id, 'ItemID', 'string', 'sword-01'),
            dataIn(this.id, 'Quantity', 'number', 1)
        ];
        this.outputs = [
            execOut(this.id, 'OnSuccess'),
            execOut(this.id, 'OnFailure'),
            dataOut(this.id, 'PricePaid', 'string')
        ];
    }

    getTypeName(): string { return 'ShopActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ShopActuator',
            label: 'Vendor Shop',
            category: 'Economics',
            color: '#ccaa00',
            description: 'Buy an item from a registered vendor.',
            icon: '🛒'
        };
    }

    onExecute(pinId: string, ctx: any): void {
        if (pinId === this.inputs[0].id) {
            const engine = ctx.engine;
            const vendorId = this.getInput('VendorID');
            const itemId = this.getInput('ItemID');
            const quantity = this.getInput('Quantity');

            const vendor = engine.economics.getVendor(vendorId);
            if (!vendor) {
                console.warn(`[SHOP] Vendor not found: ${vendorId}`);
                this.trigger('OnFailure', ctx);
                return;
            }

            const stock = vendor.stock.find((s: any) => s.itemId === itemId);
            if (!stock || (stock.quantity < quantity && !stock.unlimited)) {
                console.warn(`[SHOP] Out of stock: ${itemId}`);
                this.trigger('OnFailure', ctx);
                return;
            }

            // Transaction Success (Simulated currency check)
            if (!stock.unlimited) stock.quantity -= quantity;
            
            this.setOutput('PricePaid', (stock.price * BigInt(quantity)).toString());
            this.trigger('OnSuccess', ctx);
            
            console.log(`[SHOP] ${ctx.b3obj.name} bought ${quantity}x ${itemId} from ${vendor.name}`);
        }
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out) ctx.executor.executePin(out.id, ctx);
    }

    update() {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'ShopActuator' }; }
    static fromJSON(data: any): ShopActuator {
        const n = new ShopActuator(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * ArmoryActuator: Manages a weapon rack or storage unit.
 */
export class ArmoryActuator extends Actuator {
    private currentStock = 0;

    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Restock'),
            dataIn(this.id, 'WeaponType', 'string', 'Sword'),
            dataIn(this.id, 'MaxStock', 'number', 5)
        ];
        this.outputs = [
            execOut(this.id, 'OnEmpty'),
            dataOut(this.id, 'CurrentStock', 'number')
        ];
        this.currentStock = this.getInput('MaxStock') || 5;
    }

    getTypeName(): string { return 'ArmoryActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ArmoryActuator',
            label: 'Armory Storage',
            category: 'Economics',
            color: '#ef4444',
            description: 'Manage a collection of weapons or gear.',
            icon: '🛡️'
        };
    }

    onExecute(pinId: string, ctx: any): void {
        if (pinId === this.inputs[0].id) {
            this.currentStock = this.getInput('MaxStock');
            this.updateOutputs(ctx);
        }
    }

    /** Called when an item is taken from the armory */
    public takeItem(ctx: any) {
        if (this.currentStock > 0) {
            this.currentStock--;
            this.updateOutputs(ctx);
            
            if (this.currentStock === 0) {
                const out = this.outputs.find(o => o.name === 'OnEmpty');
                if (out) ctx.executor.executePin(out.id, ctx);
            }
            return true;
        }
        return false;
    }

    private updateOutputs(ctx: any) {
        this.setOutput('CurrentStock', this.currentStock);
    }

    update() {}
    execute() {}

    toJSON() { 
        return { 
            ...super.toJSON(), 
            type: 'ArmoryActuator',
            currentStock: this.currentStock
        }; 
    }
    static fromJSON(data: any): ArmoryActuator {
        const n = new ArmoryActuator(data.id);
        n.restorePins(data);
        n.currentStock = data.currentStock || 0;
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}
