/**
 * B3JS Engine — CircuitForge
 *
 * The in-world circuit building gameplay layer. Players place gate objects
 * in the 3D world (glowing prisms, color-coded by gate type), draw wires
 * between them, watch the circuit evaluate live, then publish the result
 * as a CircuitBlueprint — the artifact a ZK ceremony forges parameters for.
 *
 * The forge is a thin spatial skin over @b3js/zk's CircuitBuilder: all
 * graph semantics (validation, evaluation, hashing) live in the core;
 * this class owns meshes, wires, and world interaction.
 *
 * Gameplay loop:
 *   forge.startForge('Loot Gate')
 *   forge.placeGate('input',  pos, { label: 'itemId', isPrivate: true })
 *   forge.placeGate('const',  pos, { constValue: '1337' })
 *   forge.placeGate('mul',    pos)
 *   forge.wireGates(a, m); forge.wireGates(c, m); …
 *   forge.evaluateLive({ itemId: 1337n })        // lights up outputs
 *   await forge.publish()                        // → blueprint + ceremony-ready hash
 */

import * as THREE from 'three';
import { CircuitBuilder, hashBlueprint } from '@b3js/zk';
import type { CircuitBlueprint, CircuitGateType, CircuitEvaluationResult } from '@b3js/zk';
import { B3Object } from './core/B3Object';
import type { B3Engine } from './index';

/** Visual identity per gate type — color, emissive, shape. */
const GATE_VISUALS: Record<CircuitGateType, { color: number; emissive: number; shape: 'sphere' | 'cube' | 'octa' | 'icosa' | 'cone' }> = {
    input:     { color: 0x00d4ff, emissive: 0x004455, shape: 'sphere' },
    const:     { color: 0x888899, emissive: 0x222233, shape: 'cube' },
    add:       { color: 0x00ff88, emissive: 0x004422, shape: 'octa' },
    mul:       { color: 0xff8844, emissive: 0x552200, shape: 'cube' },
    poseidon:  { color: 0xb366ff, emissive: 0x330055, shape: 'icosa' },
    iszero:    { color: 0xffee44, emissive: 0x444400, shape: 'octa' },
    select:    { color: 0x4488ff, emissive: 0x001144, shape: 'cube' },
    assert_eq: { color: 0xff3366, emissive: 0x550011, shape: 'cone' },
    output:    { color: 0xffd700, emissive: 0x554400, shape: 'sphere' },
};

const GATE_SIZE = 0.6;

interface ForgeWire {
    fromGateId: string;
    toGateId: string;
    line: THREE.Line;
}

export interface ForgeSession {
    builder: CircuitBuilder;
    /** gateId → B3Object id */
    gateObjects: Map<string, string>;
    wires: ForgeWire[];
    /** Latest live evaluation result (null until evaluated). */
    lastEvaluation: CircuitEvaluationResult | null;
}

export class CircuitForge {
    public session: ForgeSession | null = null;
    private wireGroup: THREE.Group | null = null;

    constructor(private engine: B3Engine) {}

    // ─── Session Lifecycle ───────────────────────────────────────

    /** Start a new forge session (one circuit at a time per player). */
    startForge(name: string = 'Untitled Circuit'): ForgeSession {
        if (this.session) this.clearForge();

        this.session = {
            builder: new CircuitBuilder(name, this.engine.ceremony?.localIdentity()),
            gateObjects: new Map(),
            wires: [],
            lastEvaluation: null,
        };

        this.wireGroup = new THREE.Group();
        this.wireGroup.name = 'circuit-forge-wires';
        this.engine.scene.add(this.wireGroup);

        console.log(`B3JS Forge: started "${name}"`);
        return this.session;
    }

    /** Remove all forge objects and wires from the world. */
    clearForge(): void {
        if (!this.session) return;
        for (const objId of this.session.gateObjects.values()) {
            this.engine.removeObject(objId);
        }
        if (this.wireGroup) {
            this.engine.scene.remove(this.wireGroup);
            this.wireGroup = null;
        }
        this.session = null;
    }

    // ─── Gate Placement ──────────────────────────────────────────

    /**
     * Place a gate object in the world and add it to the circuit graph.
     * Returns the gate id (graph identity — the B3Object is its body).
     */
    placeGate(
        type: CircuitGateType,
        position: { x: number; y: number; z: number },
        opts: { label?: string; constValue?: string; isPrivate?: boolean } = {},
    ): string {
        if (!this.session) this.startForge();

        const session = this.session!;
        const gateId = session.builder.addGate(type, {
            label: opts.label,
            constValue: opts.constValue,
            isPrivate: opts.isPrivate,
            position: { ...position },
        });

        const obj = this.spawnGateMesh(type, opts.label ?? type, position);
        obj.metadata.circuitGate = { gateId, gateType: type, label: opts.label };
        session.gateObjects.set(gateId, obj.id);

        this.dispatch('b3js:forge:gate', { gateId, gateType: type });
        return gateId;
    }

    /** Remove a gate object, its wires, and its graph node. */
    removeGate(gateId: string): void {
        if (!this.session) return;
        const session = this.session;

        session.builder.removeGate(gateId);
        const objId = session.gateObjects.get(gateId);
        if (objId) this.engine.removeObject(objId);
        session.gateObjects.delete(gateId);

        // Drop wires touching this gate
        session.wires = session.wires.filter((w) => {
            if (w.fromGateId === gateId || w.toGateId === gateId) {
                this.wireGroup?.remove(w.line);
                w.line.geometry.dispose();
                (w.line.material as THREE.Material).dispose();
                return false;
            }
            return true;
        });
    }

    // ─── Wiring ──────────────────────────────────────────────────

    /** Wire two gates: graph edge + visible energy line in the world. */
    wireGates(fromGateId: string, toGateId: string): void {
        if (!this.session) throw new Error('CircuitForge: no active forge session.');
        const session = this.session;

        session.builder.connect(fromGateId, toGateId);

        const fromPos = this.gatePosition(fromGateId);
        const toPos = this.gatePosition(toGateId);
        if (!fromPos || !toPos) return;

        const geometry = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);
        const material = new THREE.LineBasicMaterial({ color: 0xb366ff, transparent: true, opacity: 0.8 });
        const line = new THREE.Line(geometry, material);
        this.wireGroup?.add(line);

        session.wires.push({ fromGateId, toGateId, line });
        this.dispatch('b3js:forge:wire', { fromGateId, toGateId });
    }

    /** Remove the wire from → to (if any). */
    unwireGates(fromGateId: string, toGateId: string): void {
        if (!this.session) return;
        const session = this.session;
        session.builder.disconnect(fromGateId, toGateId);
        session.wires = session.wires.filter((w) => {
            if (w.fromGateId === fromGateId && w.toGateId === toGateId) {
                this.wireGroup?.remove(w.line);
                w.line.geometry.dispose();
                (w.line.material as THREE.Material).dispose();
                return false;
            }
            return true;
        });
    }

    // ─── Evaluation & Publishing ─────────────────────────────────

    /** Structural validation problems (empty = circuit is well-formed). */
    validate(): string[] {
        return this.session ? this.session.builder.validate() : ['No active forge session.'];
    }

    /**
     * Evaluate the circuit live and visualize: output gates glow gold when
     * all assertions hold, red when any fails.
     */
    evaluateLive(inputs: Record<string, bigint | number | string> = {}): CircuitEvaluationResult | null {
        if (!this.session) return null;
        const session = this.session;

        // Inject Poseidon from the engine's ZKManager if available
        if (this.engine.zk && !session.builder.poseidon) {
            session.builder.poseidon = (xs: bigint[]) => this.engine.zk.hash(xs);
        }

        const result = session.builder.evaluate(inputs);
        session.lastEvaluation = result;
        this.visualizeEvaluation(result);
        this.dispatch('b3js:forge:evaluate', { satisfied: result.satisfied, constraintCount: result.constraintCount });
        return result;
    }

    /**
     * Publish the forged circuit as a blueprint: validated, hashed, and
     * pushed to the lobby so ceremonies (and other players) can use it.
     */
    async publish(existingBlueprintId?: string): Promise<CircuitBlueprint> {
        if (!this.session) throw new Error('CircuitForge: no active forge session.');
        return this.engine.ceremony.publishBlueprint(this.session.builder, existingBlueprintId);
    }

    /** Content hash of the current circuit — what a ceremony binds to. */
    async hash(): Promise<string> {
        if (!this.session) throw new Error('CircuitForge: no active forge session.');
        return hashBlueprint(this.session.builder.toBlueprint());
    }

    /**
     * Load a blueprint into the world (e.g. one published by another
     * player) — spawns gate objects at their saved positions and rewires.
     */
    loadBlueprint(bp: CircuitBlueprint): ForgeSession {
        const session = this.startForge(bp.name);
        session.builder = CircuitBuilder.fromBlueprint(bp);

        for (const gate of bp.gates) {
            const pos = gate.position ?? { x: 0, y: 2, z: 0 };
            const obj = this.spawnGateMesh(gate.type, gate.label ?? gate.type, pos);
            obj.metadata.circuitGate = { gateId: gate.id, gateType: gate.type, label: gate.label };
            session.gateObjects.set(gate.id, obj.id);
        }
        for (const gate of bp.gates) {
            for (const inputId of gate.inputs) {
                this.wireGates(inputId, gate.id);
            }
        }
        return session;
    }

    // ─── Per-Frame Update ────────────────────────────────────────

    /** Keep wire endpoints glued to their gate objects (call each frame). */
    update(): void {
        if (!this.session || !this.wireGroup) return;
        for (const wire of this.session.wires) {
            const from = this.gatePosition(wire.fromGateId);
            const to = this.gatePosition(wire.toGateId);
            if (!from || !to) continue;
            const pos = wire.line.geometry.attributes.position as THREE.BufferAttribute;
            pos.setXYZ(0, from.x, from.y, from.z);
            pos.setXYZ(1, to.x, to.y, to.z);
            pos.needsUpdate = true;
        }
    }

    // ─── Internals ───────────────────────────────────────────────

    private spawnGateMesh(
        type: CircuitGateType,
        name: string,
        position: { x: number; y: number; z: number },
    ): B3Object {
        const visual = GATE_VISUALS[type];
        let geometry: THREE.BufferGeometry;
        switch (visual.shape) {
            case 'sphere': geometry = new THREE.SphereGeometry(GATE_SIZE * 0.6, 24, 24); break;
            case 'octa': geometry = new THREE.OctahedronGeometry(GATE_SIZE * 0.7); break;
            case 'icosa': geometry = new THREE.IcosahedronGeometry(GATE_SIZE * 0.7); break;
            case 'cone': geometry = new THREE.ConeGeometry(GATE_SIZE * 0.5, GATE_SIZE * 1.2, 20); break;
            default: geometry = new THREE.BoxGeometry(GATE_SIZE, GATE_SIZE, GATE_SIZE);
        }

        const material = new THREE.MeshStandardMaterial({
            color: visual.color,
            emissive: visual.emissive,
            emissiveIntensity: 1.0,
            metalness: 0.3,
            roughness: 0.4,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.castShadow = true;

        const b3obj = new B3Object(mesh);
        b3obj.name = `⚡ ${name}`;
        b3obj.type = 'CircuitGate';
        // Gates float — no physics body by default (pure world-building props)

        this.engine.addObject(b3obj);
        return b3obj;
    }

    private gatePosition(gateId: string): THREE.Vector3 | null {
        const objId = this.session?.gateObjects.get(gateId);
        if (!objId) return null;
        const obj = this.engine.objects.find((o) => o.id === objId);
        return obj ? obj.object.position : null;
    }

    private dispatch(type: string, detail: any): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        }
    }

    private visualizeEvaluation(result: CircuitEvaluationResult): void {
        if (!this.session) return;
        const session = this.session;

        for (const [gateId, objId] of session.gateObjects) {
            const obj = this.engine.objects.find((o) => o.id === objId);
            if (!obj) continue;
            const gate = session.builder.getGate(gateId);
            const mesh = obj.object as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (!gate || !material) continue;

            if (gate.type === 'output') {
                // Gold pulse on success, red flash on constraint failure
                material.emissive.setHex(result.satisfied ? 0xffd700 : 0xff0000);
                material.emissiveIntensity = result.satisfied ? 1.5 : 2.5;
            } else if (gate.type === 'assert_eq') {
                material.emissive.setHex(result.satisfied ? 0x00ff88 : 0xff0000);
                material.emissiveIntensity = 2.0;
            }
        }
    }
}
