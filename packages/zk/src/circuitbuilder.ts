/**
 * @b3js/zk — CircuitBuilder
 *
 * The gameplay-facing arithmetic circuit model. Players place gate objects
 * in the 3D world, wire them together, and this module evaluates, validates,
 * and serializes the resulting circuit blueprint. Blueprints are what ZK
 * ceremonies produce proving/verification parameters for.
 *
 * All arithmetic is over the BN254 scalar field (matching snarkjs/circomlib).
 * The builder is engine-agnostic: the 3D placement layer lives in
 * packages/engine and writes positions into gate metadata.
 */

import type {
    CircuitBlueprint,
    CircuitEvaluationResult,
    CircuitGate,
    CircuitGateType,
} from './types';

/** BN254 scalar field prime — the field circom/snarkjs circuits operate in. */
export const BN254_FIELD_PRIME =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Reduce a bigint into the BN254 field. */
export function fieldMod(x: bigint): bigint {
    const r = x % BN254_FIELD_PRIME;
    return r >= 0n ? r : r + BN254_FIELD_PRIME;
}

/**
 * Rough R1CS constraint estimates per gate type (for gameplay scoring and
 * ceremony sizing — not a substitute for a real compiler's count).
 */
export const GATE_CONSTRAINT_ESTIMATES: Record<CircuitGateType, (gate: CircuitGate) => number> = {
    input: () => 0,
    const: () => 0,
    add: () => 0,                                        // linear combinations are free in R1CS
    mul: (g) => Math.max(1, g.inputs.length - 1),        // one constraint per multiplication
    poseidon: (g) => 200 + 50 * g.inputs.length,         // Poseidon permutation estimate
    iszero: () => 2,                                     // inv trick: 2 constraints
    select: () => 2,                                     // booleanity + mux
    assert_eq: () => 1,
    output: () => 0,
};

export type PoseidonFn = (inputs: bigint[]) => bigint;

let gateIdSeq = 0;
function nextGateId(): string {
    return `gate_${Date.now().toString(36)}_${(gateIdSeq++).toString(36)}`;
}

export class CircuitBuilder {
    private gates: Map<string, CircuitGate> = new Map();
    private outputs: string[] = [];

    /** Optional Poseidon implementation (inject from ZKManager/circomlibjs). */
    public poseidon: PoseidonFn | null = null;

    constructor(public name: string = 'Untitled Circuit', public creatorId?: string) {}

    // ─── Graph Construction ──────────────────────────────────────

    /** Add a gate and return its id. */
    addGate(
        type: CircuitGateType,
        opts: Partial<Pick<CircuitGate, 'label' | 'constValue' | 'isPrivate' | 'position' | 'metadata'>> = {},
    ): string {
        const gate: CircuitGate = {
            id: nextGateId(),
            type,
            label: opts.label,
            constValue: opts.constValue,
            isPrivate: opts.isPrivate,
            inputs: [],
            position: opts.position,
            metadata: opts.metadata,
        };
        if (type === 'const' && gate.constValue === undefined) gate.constValue = '0';
        this.gates.set(gate.id, gate);
        if (type === 'output') this.outputs.push(gate.id);
        return gate.id;
    }

    /** Wire `fromId`'s signal into `toId` (appended to its operand list). */
    connect(fromId: string, toId: string): void {
        const from = this.gates.get(fromId);
        const to = this.gates.get(toId);
        if (!from) throw new Error(`CircuitBuilder: source gate "${fromId}" not found.`);
        if (!to) throw new Error(`CircuitBuilder: target gate "${toId}" not found.`);
        if (fromId === toId) throw new Error('CircuitBuilder: cannot wire a gate to itself.');
        to.inputs.push(fromId);
    }

    /** Remove a wire. */
    disconnect(fromId: string, toId: string): void {
        const to = this.gates.get(toId);
        if (!to) return;
        to.inputs = to.inputs.filter((id) => id !== fromId);
    }

    /** Remove a gate and all wires touching it. */
    removeGate(id: string): void {
        this.gates.delete(id);
        this.outputs = this.outputs.filter((o) => o !== id);
        for (const g of this.gates.values()) {
            g.inputs = g.inputs.filter((i) => i !== id);
        }
    }

    getGate(id: string): CircuitGate | undefined {
        return this.gates.get(id);
    }

    getGates(): CircuitGate[] {
        return Array.from(this.gates.values());
    }

    // ─── Validation ──────────────────────────────────────────────

    /**
     * Structural validation: dangling wires, cycles, operand arity,
     * and at least one output. Returns a list of human-readable problems.
     */
    validate(): string[] {
        const problems: string[] = [];

        for (const g of this.gates.values()) {
            for (const inputId of g.inputs) {
                if (!this.gates.has(inputId)) {
                    problems.push(`Gate ${g.label || g.id} (${g.type}) has a dangling wire from "${inputId}".`);
                }
            }
            switch (g.type) {
                case 'input':
                case 'const':
                    if (g.inputs.length > 0) problems.push(`Gate ${g.label || g.id} (${g.type}) must not have inputs.`);
                    break;
                case 'add':
                case 'mul':
                    if (g.inputs.length < 2) problems.push(`Gate ${g.label || g.id} (${g.type}) needs ≥ 2 inputs.`);
                    break;
                case 'poseidon':
                    if (g.inputs.length < 1) problems.push(`Gate ${g.label || g.id} (poseidon) needs ≥ 1 input.`);
                    break;
                case 'iszero':
                case 'output':
                    if (g.inputs.length !== 1) problems.push(`Gate ${g.label || g.id} (${g.type}) needs exactly 1 input.`);
                    break;
                case 'select':
                    if (g.inputs.length !== 3) problems.push(`Gate ${g.label || g.id} (select) needs exactly 3 inputs [cond, a, b].`);
                    break;
                case 'assert_eq':
                    if (g.inputs.length !== 2) problems.push(`Gate ${g.label || g.id} (assert_eq) needs exactly 2 inputs.`);
                    break;
            }
        }

        if (this.outputs.length === 0) {
            problems.push('Circuit has no output gates.');
        }

        // Cycle detection via topological sort
        try {
            this.topologicalOrder();
        } catch (e: any) {
            problems.push(e.message);
        }

        return problems;
    }

    /** Kahn's algorithm — returns gate ids in dependency order. */
    private topologicalOrder(): string[] {
        const inDegree = new Map<string, number>();
        for (const g of this.gates.values()) inDegree.set(g.id, 0);
        for (const g of this.gates.values()) {
            for (const inputId of g.inputs) {
                if (this.gates.has(inputId)) {
                    // edge inputId → g.id
                    inDegree.set(g.id, (inDegree.get(g.id) || 0) + 1);
                }
            }
        }

        const queue: string[] = [];
        for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

        const order: string[] = [];
        while (queue.length > 0) {
            const id = queue.shift()!;
            order.push(id);
            for (const g of this.gates.values()) {
                if (g.inputs.includes(id)) {
                    const d = (inDegree.get(g.id) || 0) - 1;
                    inDegree.set(g.id, d);
                    if (d === 0) queue.push(g.id);
                }
            }
        }

        if (order.length !== this.gates.size) {
            throw new Error('Circuit contains a cycle — feedback loops are not valid in arithmetic circuits.');
        }
        return order;
    }

    // ─── Evaluation ──────────────────────────────────────────────

    /**
     * Evaluate the circuit with concrete input values.
     *
     * @param inputValues - Map of input-gate id OR label → value.
     *                      Missing inputs default to 0.
     */
    evaluate(inputValues: Record<string, bigint | number | string> = {}): CircuitEvaluationResult {
        const order = this.topologicalOrder();
        const witness = new Map<string, bigint>();
        const failures: string[] = [];
        let constraintCount = 0;

        const lookupInput = (gate: CircuitGate): bigint => {
            const raw = inputValues[gate.id] ?? (gate.label !== undefined ? inputValues[gate.label] : undefined);
            if (raw === undefined) return 0n;
            return fieldMod(typeof raw === 'bigint' ? raw : BigInt(raw));
        };

        for (const id of order) {
            const gate = this.gates.get(id)!;
            const estimate = GATE_CONSTRAINT_ESTIMATES[gate.type];
            constraintCount += estimate(gate);

            const args = gate.inputs.map((i) => witness.get(i) ?? 0n);
            let value: bigint;

            switch (gate.type) {
                case 'input':
                    value = lookupInput(gate);
                    break;
                case 'const':
                    value = fieldMod(BigInt(gate.constValue ?? '0'));
                    break;
                case 'add':
                    value = args.reduce((a, b) => fieldMod(a + b), 0n);
                    break;
                case 'mul':
                    value = args.reduce((a, b) => fieldMod(a * b), 1n);
                    break;
                case 'poseidon':
                    if (!this.poseidon) {
                        throw new Error(
                            'CircuitBuilder: a poseidon gate requires an injected Poseidon function ' +
                            '(set builder.poseidon, e.g. from ZKManager.hash).',
                        );
                    }
                    value = fieldMod(this.poseidon(args));
                    break;
                case 'iszero':
                    value = args[0] === 0n ? 1n : 0n;
                    break;
                case 'select': {
                    const [cond, a, b] = args;
                    if (cond !== 0n && cond !== 1n) {
                        failures.push(`select gate ${gate.label || gate.id}: condition is not boolean (${cond}).`);
                    }
                    value = cond === 1n ? a : b;
                    break;
                }
                case 'assert_eq':
                    if (args[0] !== args[1]) {
                        failures.push(
                            `assert_eq gate ${gate.label || gate.id} failed: ${args[0]} ≠ ${args[1]}.`,
                        );
                    }
                    value = args[0] ?? 0n;
                    break;
                case 'output':
                    value = args[0] ?? 0n;
                    break;
                default:
                    throw new Error(`CircuitBuilder: unknown gate type "${(gate as any).type}".`);
            }

            witness.set(id, value);
        }

        return {
            outputs: this.outputs.map((id) => witness.get(id) ?? 0n),
            witness,
            constraintCount,
            satisfied: failures.length === 0,
            failures,
        };
    }

    // ─── Compilation / Serialization ─────────────────────────────

    /** Snapshot the design as a portable blueprint. */
    toBlueprint(existingId?: string, version: number = 1): CircuitBlueprint {
        return {
            id: existingId ?? `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: this.name,
            gates: this.getGates().map((g) => ({ ...g, inputs: [...g.inputs] })),
            outputs: [...this.outputs],
            creatorId: this.creatorId,
            createdAt: Date.now(),
            version,
        };
    }

    /** Rebuild a CircuitBuilder from a blueprint. */
    static fromBlueprint(bp: CircuitBlueprint): CircuitBuilder {
        const builder = new CircuitBuilder(bp.name, bp.creatorId);
        for (const gate of bp.gates) {
            builder.gates.set(gate.id, { ...gate, inputs: [...gate.inputs] });
        }
        builder.outputs = [...bp.outputs];
        return builder;
    }

    /**
     * Export the circuit as readable Circom 2.x source.
     * This is the bridge from gameplay-built circuits to real toolchain
     * compilation (circom → snarkjs), making game-built circuits provable
     * outside the engine.
     */
    exportCircom(): string {
        const problems = this.validate();
        if (problems.length > 0) {
            throw new Error(`Cannot export invalid circuit:\n  - ${problems.join('\n  - ')}`);
        }

        const order = this.topologicalOrder();
        const lines: string[] = [];
        const signalName = (id: string) => `s_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

        lines.push('pragma circom 2.0.0;');
        lines.push('include "circomlib/poseidon.circom";');
        lines.push('');
        lines.push(`// Exported from B3JS circuit "${this.name}"`);
        lines.push(`template ${this.name.replace(/[^a-zA-Z0-9_]/g, '_') || 'GameCircuit'}() {`);

        const inputs = order.filter((id) => this.gates.get(id)!.type === 'input');
        for (const id of inputs) {
            const g = this.gates.get(id)!;
            lines.push(`    signal ${g.isPrivate ? 'input' : 'input'} ${signalName(id)}; // ${g.label || id}${g.isPrivate ? ' (private)' : ''}`);
        }
        lines.push('');
        for (const id of this.outputs) {
            lines.push(`    signal output ${signalName(id)};`);
        }
        lines.push('');

        for (const id of order) {
            const g = this.gates.get(id)!;
            const name = signalName(id);
            const args = g.inputs.map(signalName);
            switch (g.type) {
                case 'input':
                case 'output':
                    break; // declared above
                case 'const':
                    lines.push(`    signal ${name};`);
                    lines.push(`    ${name} <== ${g.constValue ?? '0'};`);
                    break;
                case 'add':
                    lines.push(`    signal ${name};`);
                    lines.push(`    ${name} <== ${args.join(' + ')};`);
                    break;
                case 'mul': {
                    lines.push(`    signal ${name};`);
                    // Chain multiplications for >2 operands
                    let expr = args[0];
                    for (let i = 1; i < args.length; i++) {
                        if (i < args.length - 1) {
                            lines.push(`    signal ${name}_m${i};`);
                            lines.push(`    ${name}_m${i} <== ${expr} * ${args[i]};`);
                            expr = `${name}_m${i}`;
                        } else {
                            lines.push(`    ${name} <== ${expr} * ${args[i]};`);
                        }
                    }
                    if (args.length === 2) {
                        // handled by loop above when length===2? No — re-emit simply
                    }
                    break;
                }
                case 'poseidon':
                    lines.push(`    component ${name}_h = Poseidon(${args.length});`);
                    args.forEach((a, i) => lines.push(`    ${name}_h.inputs[${i}] <== ${a};`));
                    lines.push(`    signal ${name};`);
                    lines.push(`    ${name} <== ${name}_h.out;`);
                    break;
                case 'iszero':
                    lines.push(`    component ${name}_z = IsZero();`);
                    lines.push(`    ${name}_z.in <== ${args[0]};`);
                    lines.push(`    signal ${name};`);
                    lines.push(`    ${name} <== ${name}_z.out;`);
                    break;
                case 'select': {
                    lines.push(`    signal ${name};`);
                    lines.push(`    ${name} <== ${args[0]} * (${args[1]} - ${args[2]}) + ${args[2]};`);
                    break;
                }
                case 'assert_eq':
                    lines.push(`    ${args[0]} === ${args[1]};`);
                    break;
            }
        }

        lines.push('');
        for (const id of this.outputs) {
            const g = this.gates.get(id)!;
            if (g.inputs.length === 1) {
                lines.push(`    ${signalName(id)} <== ${signalName(g.inputs[0])};`);
            }
        }
        lines.push('}');
        lines.push('');
        lines.push('component main = ' + (this.name.replace(/[^a-zA-Z0-9_]/g, '_') || 'GameCircuit') + '();');
        lines.push('');
        return lines.join('\n');
    }
}

// ─── Blueprint Hashing ───────────────────────────────────────────

/**
 * Canonical JSON of a blueprint (stable key order, positions excluded so
 * moving gate objects in the world doesn't change the circuit identity).
 */
export function canonicalBlueprintJSON(bp: CircuitBlueprint): string {
    const canonical = {
        name: bp.name,
        version: bp.version,
        gates: [...bp.gates]
            .map((g) => ({
                id: g.id,
                type: g.type,
                label: g.label ?? null,
                constValue: g.constValue ?? null,
                isPrivate: g.isPrivate ?? false,
                inputs: [...g.inputs],
            }))
            .sort((a, b) => (a.id < b.id ? -1 : 1)),
        outputs: [...bp.outputs],
    };
    return JSON.stringify(canonical);
}

/** SHA-256 hex of any data (Web Crypto — works in browser, Bun, and Node ≥ 20). */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Content hash that binds a ceremony to an exact circuit design. */
export async function hashBlueprint(bp: CircuitBlueprint): Promise<string> {
    return sha256Hex(canonicalBlueprintJSON(bp));
}
