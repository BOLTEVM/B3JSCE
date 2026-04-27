import { nanoid } from 'nanoid';

// ─── Pin Data Types ────────────────────────────────────────────
// Color-coded in the UI: exec=white, bool=red, number=green, vector3=gold, string=magenta, object=cyan
export type PinDataType = 'exec' | 'boolean' | 'number' | 'vector3' | 'string' | 'object' | 'any';
export type PinDirection = 'input' | 'output';

export interface IPin {
    id: string;
    name: string;
    dataType: PinDataType;
    direction: PinDirection;
    value?: any;               // Default / current value for data pins
    connectedTo: string[];     // IDs of connected pins (exec can have 1, data can have many)
    nodeId: string;            // Owner node ID
}

export interface IConnection {
    id: string;
    fromPinId: string;
    toPinId: string;
}

// ─── Pin Factory Helpers ───────────────────────────────────────

export function createPin(
    name: string,
    dataType: PinDataType,
    direction: PinDirection,
    nodeId: string,
    defaultValue?: any
): IPin {
    return {
        id: nanoid(),
        name,
        dataType,
        direction,
        value: defaultValue,
        connectedTo: [],
        nodeId
    };
}

export function execIn(nodeId: string, name = 'In'): IPin {
    return createPin(name, 'exec', 'input', nodeId);
}

export function execOut(nodeId: string, name = 'Out'): IPin {
    return createPin(name, 'exec', 'output', nodeId);
}

export function dataIn(nodeId: string, name: string, type: PinDataType, defaultValue?: any): IPin {
    return createPin(name, type, 'input', nodeId, defaultValue);
}

export function dataOut(nodeId: string, name: string, type: PinDataType): IPin {
    return createPin(name, type, 'output', nodeId);
}

// ─── Type Compatibility ────────────────────────────────────────

const TYPE_COMPAT: Record<PinDataType, PinDataType[]> = {
    'exec':    ['exec'],
    'boolean': ['boolean', 'any'],
    'number':  ['number', 'any'],
    'vector3': ['vector3', 'any'],
    'string':  ['string', 'any'],
    'object':  ['object', 'any'],
    'any':     ['boolean', 'number', 'vector3', 'string', 'object', 'any']
};

/** Returns true if an output pin of typeA can connect to an input pin of typeB */
export function canConnect(typeA: PinDataType, typeB: PinDataType): boolean {
    if (typeA === 'exec' && typeB === 'exec') return true;
    if (typeA === 'exec' || typeB === 'exec') return false;
    return TYPE_COMPAT[typeA]?.includes(typeB) || TYPE_COMPAT[typeB]?.includes(typeA) || false;
}

/** Wire color mapping for UI rendering */
export const PIN_COLORS: Record<PinDataType, string> = {
    'exec':    '#ffffff',
    'boolean': '#ff3366',
    'number':  '#00cc66',
    'vector3': '#ffaa00',
    'string':  '#cc44ff',
    'object':  '#00ccff',
    'any':     '#888888'
};

// ─── Serialization ─────────────────────────────────────────────

export function pinToJSON(pin: IPin): any {
    return {
        id: pin.id,
        name: pin.name,
        dataType: pin.dataType,
        direction: pin.direction,
        value: pin.value,
        connectedTo: [...pin.connectedTo],
        nodeId: pin.nodeId
    };
}

export function pinFromJSON(data: any): IPin {
    return {
        id: data.id,
        name: data.name,
        dataType: data.dataType,
        direction: data.direction,
        value: data.value,
        connectedTo: data.connectedTo || [],
        nodeId: data.nodeId
    };
}
