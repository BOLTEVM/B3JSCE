/**
 * @b3js/zk tests — CircuitBuilder
 *
 * Covers graph construction, validation, field evaluation,
 * blueprint round-tripping, and circom export.
 */

import { describe, test, expect } from 'bun:test';
import {
    CircuitBuilder,
    BN254_FIELD_PRIME,
    canonicalBlueprintJSON,
    fieldMod,
    hashBlueprint,
} from '../src/circuitbuilder';

describe('CircuitBuilder', () => {
    test('builds and evaluates a simple arithmetic circuit', () => {
        // (a + b) * c
        const b = new CircuitBuilder('multiply-sum');
        const a = b.addGate('input', { label: 'a' });
        const bb = b.addGate('input', { label: 'b' });
        const c = b.addGate('input', { label: 'c' });
        const sum = b.addGate('add');
        const prod = b.addGate('mul');
        const out = b.addGate('output');

        b.connect(a, sum);
        b.connect(bb, sum);
        b.connect(sum, prod);
        b.connect(c, prod);
        b.connect(prod, out);

        const result = b.evaluate({ a: 3n, b: 4n, c: 5n });
        expect(result.satisfied).toBe(true);
        expect(result.outputs).toEqual([35n]);
        expect(result.constraintCount).toBe(1); // one mul
    });

    test('field arithmetic wraps mod BN254 prime', () => {
        expect(fieldMod(BN254_FIELD_PRIME)).toBe(0n);
        expect(fieldMod(-1n)).toBe(BN254_FIELD_PRIME - 1n);
        expect(fieldMod(BN254_FIELD_PRIME + 7n)).toBe(7n);
    });

    test('assert_eq records failures', () => {
        const b = new CircuitBuilder('assert');
        const x = b.addGate('input', { label: 'x' });
        const c = b.addGate('const', { constValue: '42' });
        const assert = b.addGate('assert_eq');
        const out = b.addGate('output');
        b.connect(x, assert);
        b.connect(c, assert);
        b.connect(x, out);

        expect(b.evaluate({ x: 42n }).satisfied).toBe(true);
        const bad = b.evaluate({ x: 41n });
        expect(bad.satisfied).toBe(false);
        expect(bad.failures.length).toBe(1);
    });

    test('select gate picks branch by boolean condition', () => {
        const b = new CircuitBuilder('mux');
        const cond = b.addGate('input', { label: 'cond' });
        const a = b.addGate('const', { constValue: '10' });
        const d = b.addGate('const', { constValue: '20' });
        const sel = b.addGate('select');
        const out = b.addGate('output');
        b.connect(cond, sel);
        b.connect(a, sel);
        b.connect(d, sel);
        b.connect(sel, out);

        expect(b.evaluate({ cond: 1n }).outputs).toEqual([10n]);
        expect(b.evaluate({ cond: 0n }).outputs).toEqual([20n]);
        expect(b.evaluate({ cond: 7n }).satisfied).toBe(false); // non-boolean
    });

    test('iszero gate', () => {
        const b = new CircuitBuilder('z');
        const x = b.addGate('input', { label: 'x' });
        const z = b.addGate('iszero');
        const out = b.addGate('output');
        b.connect(x, z);
        b.connect(z, out);

        expect(b.evaluate({ x: 0n }).outputs).toEqual([1n]);
        expect(b.evaluate({ x: 9n }).outputs).toEqual([0n]);
    });

    test('poseidon gate uses injected hash function', () => {
        const b = new CircuitBuilder('hash');
        const x = b.addGate('input', { label: 'x' });
        const h = b.addGate('poseidon');
        const out = b.addGate('output');
        b.connect(x, h);
        b.connect(h, out);

        // Without injection, poseidon evaluation throws
        expect(() => b.evaluate({ x: 1n })).toThrow();

        b.poseidon = (inputs) => inputs.reduce((a, v) => fieldMod(a * 31n + v), 0n);
        const r = b.evaluate({ x: 5n });
        expect(r.outputs).toEqual([5n]); // single input: 0*31 + 5
        expect(r.constraintCount).toBe(250); // poseidon estimate: 200 + 50*1
    });

    test('validation catches dangling wires, cycles, arity, missing outputs', () => {
        const b = new CircuitBuilder('bad');
        const a = b.addGate('input', { label: 'a' });
        const m = b.addGate('mul');
        b.connect(a, m);
        expect(b.validate().some((p) => p.includes('≥ 2 inputs'))).toBe(true);
        expect(b.validate().some((p) => p.includes('no output'))).toBe(true);

        // Cycle: a→x→y→x
        const b2 = new CircuitBuilder('cyclic');
        const x = b2.addGate('add');
        const y = b2.addGate('add');
        const o = b2.addGate('output');
        const i1 = b2.addGate('input');
        const i2 = b2.addGate('input');
        b2.connect(i1, x);
        b2.connect(y, x);
        b2.connect(x, y);
        b2.connect(i2, y);
        b2.connect(x, o);
        expect(b2.validate().some((p) => p.includes('cycle'))).toBe(true);

        // Dangling wire
        const b3 = new CircuitBuilder('dangle');
        const g = b3.addGate('add');
        const gGate = b3.getGate(g)!;
        gGate.inputs.push('ghost_gate');
        const o3 = b3.addGate('output');
        b3.connect(g, o3);
        expect(b3.validate().some((p) => p.includes('dangling'))).toBe(true);
    });

    test('blueprint round-trips and canonical hash is position-independent', async () => {
        const b = new CircuitBuilder('bp-test', 'player1');
        const a = b.addGate('input', { label: 'a', position: { x: 1, y: 2, z: 3 } });
        const c = b.addGate('const', { constValue: '7', position: { x: 5, y: 0, z: 0 } });
        const m = b.addGate('mul');
        const o = b.addGate('output');
        b.connect(a, m);
        b.connect(c, m);
        b.connect(m, o);

        const bp1 = b.toBlueprint('bp_test', 1);
        const restored = CircuitBuilder.fromBlueprint(bp1);
        expect(restored.evaluate({ a: 6n }).outputs).toEqual([42n]);

        // Same circuit, gate moved in the world → same canonical hash
        const bp2 = b.toBlueprint('bp2', 1);
        bp2.gates[0].position = { x: 99, y: 99, z: 99 };
        expect(canonicalBlueprintJSON(bp1)).toBe(canonicalBlueprintJSON(bp2));
        expect(await hashBlueprint(bp1)).toBe(await hashBlueprint(bp2));
    });

    test('exports valid-looking circom source', () => {
        const b = new CircuitBuilder('LootCheck');
        const item = b.addGate('input', { label: 'itemId', isPrivate: true });
        const target = b.addGate('const', { constValue: '1337' });
        const eq = b.addGate('assert_eq');
        const out = b.addGate('output');
        b.connect(item, eq);
        b.connect(target, eq);
        b.connect(item, out);

        const src = b.exportCircom();
        expect(src).toContain('pragma circom 2.0.0;');
        expect(src).toContain('template LootCheck()');
        expect(src).toContain('===');
        expect(src).toContain('component main = LootCheck();');
    });
});
