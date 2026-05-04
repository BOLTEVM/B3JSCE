/**
 * @b3js/zk — ZKManager
 *
 * Core orchestrator for Zero Knowledge proof operations in B3JS.
 * Handles circuit artifact loading, Poseidon hashing, and proof generation/verification.
 * Proof generation is delegated to a Web Worker to avoid blocking the render loop.
 */

import type {
    CircuitArtifacts,
    ZKProof,
    SerializedZKProof,
    ZKWorkerRequest,
    ZKWorkerResponse,
    VerificationKey,
    ZKWorldConfig,
    ZKZoneDefinition,
} from './types';

import type { CommitmentStore } from './commitment';

/**
 * ZKManager — Zero Knowledge Proof Orchestrator
 *
 * Usage:
 * ```ts
 * const zk = new ZKManager();
 * await zk.init();
 * await zk.loadCircuit('inventory_proof', '/zk/inventory.wasm', '/zk/inventory.zkey');
 * const proof = await zk.prove('inventory_proof', { inventory: [...], salt: 12345n });
 * const valid = await zk.verify('inventory_proof', proof);
 * ```
 */
export class ZKManager {
    /** Loaded circuit artifacts, keyed by circuit name. */
    private artifacts: Map<string, CircuitArtifacts> = new Map();

    /** Poseidon hash function instance (from circomlibjs). */
    private poseidon: any = null;

    /** Finite field instance for BigInt operations. */
    private F: any = null;

    /** Web Worker for off-thread proof generation. */
    private worker: Worker | null = null;

    /** Pending proof/verify requests awaiting Worker responses. */
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        startTime: number;
    }> = new Map();

    /** Auto-incrementing request ID. */
    private requestIdSeq: number = 0;

    /** Whether the manager has been initialized. */
    private initialized: boolean = false;

    /** Listeners for proof generation events. */
    private onProofListeners: ((circuitName: string, proof: ZKProof, durationMs: number) => void)[] = [];

    /** Active world configuration. */
    public config: ZKWorldConfig = {
        fogOfWar: false,
        sealedInventory: true,
        sealedBids: true,
        gridResolution: 10,
        moveSpeed: 50,
        maxInventorySlots: 32,
    };

    /** Local commitment vault — manages secrets and Poseidon hashes. */
    public commitmentStore: CommitmentStore | null = null;

    /** Active ZK privacy zones (spatial regions with privacy policies). */
    public activeZones: ZKZoneDefinition[] = [];

    constructor() {}

    // ─── Initialization ──────────────────────────────────────────

    /**
     * Initialize the ZK system: load Poseidon hash and spawn the Web Worker.
     * Must be called before any hashing or proving operations.
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Initialize Poseidon hash from circomlibjs
            const circomlibjs = await import('circomlibjs');
            this.poseidon = await circomlibjs.buildPoseidon();
            this.F = this.poseidon.F;
            console.log('B3JS ZK: Poseidon hash initialized.');

            // Spawn Web Worker for proof generation
            this.spawnWorker();

            this.initialized = true;
            console.log('B3JS ZK: Manager initialized.');
        } catch (e) {
            console.error('B3JS ZK: Initialization failed.', e);
            // Graceful degradation — manager works without Worker (blocking proofs)
            this.initialized = true;
        }
    }

    /**
     * Spawn the ZK Web Worker from an inline blob.
     * Falls back to main-thread proving if Worker creation fails.
     */
    private spawnWorker(): void {
        try {
            // Inline Worker code — imports snarkjs and handles prove/verify messages
            const workerCode = `
                let snarkjs = null;

                async function loadSnarkJS() {
                    if (!snarkjs) {
                        snarkjs = await import('https://esm.sh/snarkjs@0.7.0');
                    }
                    return snarkjs;
                }

                self.onmessage = async (event) => {
                    const req = event.data;
                    const startTime = performance.now();

                    try {
                        const sjs = await loadSnarkJS();

                        if (req.type === 'prove') {
                            const { proof, publicSignals } = await sjs.groth16.fullProve(
                                req.inputs,
                                new Uint8Array(req.wasm),
                                new Uint8Array(req.zkey)
                            );

                            self.postMessage({
                                id: req.id,
                                type: 'prove_result',
                                proof: { proof, publicSignals },
                                durationMs: performance.now() - startTime
                            });
                        } else if (req.type === 'verify') {
                            const valid = await sjs.groth16.verify(
                                req.vkey,
                                req.proof.publicSignals,
                                req.proof.proof
                            );

                            self.postMessage({
                                id: req.id,
                                type: 'verify_result',
                                valid,
                                durationMs: performance.now() - startTime
                            });
                        }
                    } catch (err) {
                        self.postMessage({
                            id: req.id,
                            type: 'error',
                            error: err.message || String(err),
                            durationMs: performance.now() - startTime
                        });
                    }
                };
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });

            this.worker.onmessage = (event: MessageEvent<ZKWorkerResponse>) => {
                const response = event.data;
                const pending = this.pendingRequests.get(response.id);
                if (!pending) return;

                this.pendingRequests.delete(response.id);

                if (response.type === 'error') {
                    console.error(`B3JS ZK Worker Error [${response.id}]:`, response.error);
                    pending.reject(new Error(response.error));
                } else if (response.type === 'prove_result' && response.proof) {
                    console.log(`B3JS ZK: Proof generated in ${response.durationMs.toFixed(0)}ms`);
                    pending.resolve(response.proof);
                } else if (response.type === 'verify_result') {
                    pending.resolve(response.valid);
                }
            };

            this.worker.onerror = (err) => {
                console.error('B3JS ZK: Worker error', err);
            };

            console.log('B3JS ZK: Web Worker spawned.');
        } catch (e) {
            console.warn('B3JS ZK: Could not create Worker. Proof generation will block the main thread.', e);
            this.worker = null;
        }
    }

    // ─── Circuit Loading ─────────────────────────────────────────

    /**
     * Load pre-compiled circuit artifacts (WASM witness generator + proving key).
     * Artifacts are fetched from URLs and cached in memory.
     *
     * @param name   - Unique circuit identifier (e.g., 'inventory_proof')
     * @param wasmUrl - URL to the Circom-compiled WASM witness generator
     * @param zkeyUrl - URL to the Groth16 proving key (.zkey)
     * @param vkeyUrl - Optional URL to the verification key JSON. If omitted, the
     *                  vkey is extracted from the zkey.
     */
    async loadCircuit(name: string, wasmUrl: string, zkeyUrl: string, vkeyUrl?: string): Promise<void> {
        if (this.artifacts.has(name)) {
            console.log(`B3JS ZK: Circuit "${name}" already loaded.`);
            return;
        }

        console.log(`B3JS ZK: Loading circuit "${name}"...`);
        const startTime = performance.now();

        try {
            const [wasmBuf, zkeyBuf] = await Promise.all([
                fetch(wasmUrl).then(r => r.arrayBuffer()),
                fetch(zkeyUrl).then(r => r.arrayBuffer()),
            ]);

            let vkey: VerificationKey;
            if (vkeyUrl) {
                vkey = await fetch(vkeyUrl).then(r => r.json());
            } else {
                // Extract vkey from zkey using snarkjs
                const snarkjs = await import('snarkjs');
                vkey = await (snarkjs as any).zKey.exportVerificationKey(new Uint8Array(zkeyBuf));
            }

            this.artifacts.set(name, { wasm: wasmBuf, zkey: zkeyBuf, vkey });

            const elapsed = (performance.now() - startTime).toFixed(0);
            const wasmSize = (wasmBuf.byteLength / 1024).toFixed(0);
            const zkeySize = (zkeyBuf.byteLength / 1024).toFixed(0);
            console.log(`B3JS ZK: Circuit "${name}" loaded in ${elapsed}ms (WASM: ${wasmSize}KB, zkey: ${zkeySize}KB)`);
        } catch (e) {
            console.error(`B3JS ZK: Failed to load circuit "${name}"`, e);
            throw e;
        }
    }

    /**
     * Check if a circuit is loaded and ready for proving.
     */
    isCircuitLoaded(name: string): boolean {
        return this.artifacts.has(name);
    }

    /**
     * Get the list of loaded circuit names.
     */
    getLoadedCircuits(): string[] {
        return Array.from(this.artifacts.keys());
    }

    // ─── Hashing ─────────────────────────────────────────────────

    /**
     * Compute a Poseidon hash of arbitrary field elements.
     * Poseidon is a ZK-friendly hash (low constraint count in circuits).
     *
     * @param inputs - Array of BigInt field elements to hash
     * @returns The hash as a BigInt
     */
    hash(inputs: bigint[]): bigint {
        if (!this.poseidon) throw new Error('B3JS ZK: Poseidon not initialized. Call init() first.');
        const h = this.poseidon(inputs);
        return this.F.toObject(h);
    }

    /**
     * Hash a 3D position with a salt, quantized to the configured grid resolution.
     * The grid ensures positions within the same cell produce the same hash.
     *
     * @param x    - World X coordinate
     * @param y    - World Y coordinate
     * @param z    - World Z coordinate
     * @param salt - Random salt for privacy
     * @returns The Poseidon hash commitment
     */
    hashPosition(x: number, y: number, z: number, salt: bigint): bigint {
        const gridSize = this.config.gridResolution;
        const gx = BigInt(Math.floor(x / gridSize));
        const gy = BigInt(Math.floor(y / gridSize));
        const gz = BigInt(Math.floor(z / gridSize));
        return this.hash([gx, gy, gz, salt]);
    }

    /**
     * Hash an inventory state (array of item slots) with a salt.
     *
     * @param inventory - Array of [itemId, quantity] pairs, padded to maxInventorySlots
     * @param salt      - Random salt for privacy
     * @returns The Poseidon hash commitment
     */
    hashInventory(inventory: Array<{ itemId: number; quantity: number }>, salt: bigint): bigint {
        if (!this.poseidon) throw new Error('B3JS ZK: Poseidon not initialized. Call init() first.');

        // Flatten inventory to field elements: [itemId0, qty0, itemId1, qty1, ...]
        const maxSlots = this.config.maxInventorySlots;
        const elements: bigint[] = [];

        for (let i = 0; i < maxSlots; i++) {
            if (i < inventory.length) {
                elements.push(BigInt(inventory[i].itemId));
                elements.push(BigInt(inventory[i].quantity));
            } else {
                elements.push(0n);
                elements.push(0n);
            }
        }

        // Chained Poseidon hashing — mirrors the circuit's approach.
        // circomlibjs Poseidon supports at most ~16 inputs per call.
        // Strategy: hash 4 groups of 16 elements, then hash the 4 results + salt.
        // Total elements = maxSlots * 2 = 64, grouped as [0..15], [16..31], [32..47], [48..63]
        const GROUP_SIZE = 16;
        const numGroups = Math.ceil(elements.length / GROUP_SIZE);
        const intermediateHashes: bigint[] = [];

        for (let g = 0; g < numGroups; g++) {
            const group = elements.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE);
            // Pad group to GROUP_SIZE if needed (shouldn't happen with 32 slots)
            while (group.length < GROUP_SIZE) group.push(0n);
            const h = this.poseidon(group);
            intermediateHashes.push(this.F.toObject(h));
        }

        // Final hash: intermediate hashes + salt
        intermediateHashes.push(salt);
        const finalHash = this.poseidon(intermediateHashes);
        return this.F.toObject(finalHash);
    }

    /**
     * Hash a sealed bid amount with a salt.
     *
     * @param amount - Bid amount (in smallest unit)
     * @param salt   - Random salt for privacy
     * @returns The Poseidon hash commitment
     */
    hashBid(amount: bigint, salt: bigint): bigint {
        return this.hash([amount, salt]);
    }

    // ─── Proof Generation ────────────────────────────────────────

    /**
     * Generate a Groth16 proof for a named circuit.
     * If a Web Worker is available, proof generation runs off-thread.
     * Otherwise, falls back to main-thread (blocking) generation.
     *
     * @param circuitName - Name of the previously loaded circuit
     * @param inputs      - Circuit input signals
     * @returns The generated proof with public signals
     */
    async prove(circuitName: string, inputs: Record<string, any>): Promise<ZKProof> {
        const artifacts = this.artifacts.get(circuitName);
        if (!artifacts) throw new Error(`B3JS ZK: Circuit "${circuitName}" not loaded.`);

        const startTime = performance.now();

        if (this.worker) {
            // Off-thread proof generation via Web Worker
            return new Promise<ZKProof>((resolve, reject) => {
                const id = `zk_${this.requestIdSeq++}`;

                this.pendingRequests.set(id, { resolve, reject, startTime });

                const request: ZKWorkerRequest = {
                    id,
                    type: 'prove',
                    circuitName,
                    inputs,
                    wasm: artifacts.wasm.slice(0),  // Transfer copy
                    zkey: artifacts.zkey.slice(0),
                };

                this.worker!.postMessage(request, [request.wasm!, request.zkey!]);
            }).then((proof) => {
                const duration = performance.now() - startTime;
                this.notifyProofListeners(circuitName, proof, duration);
                return proof;
            });
        } else {
            // Main-thread fallback (blocking)
            console.warn('B3JS ZK: Generating proof on main thread (may cause frame drops).');
            const snarkjs = await import('snarkjs');
            const { proof, publicSignals } = await (snarkjs as any).groth16.fullProve(
                inputs,
                new Uint8Array(artifacts.wasm),
                new Uint8Array(artifacts.zkey)
            );
            const zkProof: ZKProof = { proof, publicSignals };
            const duration = performance.now() - startTime;
            this.notifyProofListeners(circuitName, zkProof, duration);
            return zkProof;
        }
    }

    /**
     * Verify a Groth16 proof against a circuit's verification key.
     *
     * @param circuitName - Name of the circuit to verify against
     * @param proof       - The proof to verify
     * @returns True if the proof is valid
     */
    async verify(circuitName: string, proof: ZKProof): Promise<boolean> {
        const artifacts = this.artifacts.get(circuitName);
        if (!artifacts) throw new Error(`B3JS ZK: Circuit "${circuitName}" not loaded.`);

        // Verification is fast (~5ms), so we do it on the main thread
        const snarkjs = await import('snarkjs');
        return (snarkjs as any).groth16.verify(artifacts.vkey, proof.publicSignals, proof.proof);
    }

    // ─── Serialization ───────────────────────────────────────────

    /**
     * Generate a proof and serialize it for network transmission.
     * Returns a JSON string ready to send via SpacetimeDB.
     */
    async proveAndSerialize(circuitName: string, inputs: Record<string, any>): Promise<string> {
        const proof = await this.prove(circuitName, inputs);
        const serialized: SerializedZKProof = {
            proof: JSON.stringify(proof.proof),
            publicSignals: JSON.stringify(proof.publicSignals),
            circuit: circuitName,
            timestamp: Date.now(),
        };
        return JSON.stringify(serialized);
    }

    /**
     * Deserialize a proof received from the network.
     */
    static deserializeProof(data: string): { proof: ZKProof; circuit: string; timestamp: number } {
        const parsed: SerializedZKProof = JSON.parse(data);
        return {
            proof: {
                proof: JSON.parse(parsed.proof),
                publicSignals: JSON.parse(parsed.publicSignals),
            },
            circuit: parsed.circuit,
            timestamp: parsed.timestamp,
        };
    }

    // ─── Event System ────────────────────────────────────────────

    /**
     * Register a listener for proof generation events.
     * Useful for UI progress indicators.
     */
    onProof(callback: (circuitName: string, proof: ZKProof, durationMs: number) => void): void {
        this.onProofListeners.push(callback);
    }

    private notifyProofListeners(circuitName: string, proof: ZKProof, durationMs: number): void {
        for (const listener of this.onProofListeners) {
            listener(circuitName, proof, durationMs);
        }
    }

    // ─── Utility ─────────────────────────────────────────────────

    /**
     * Generate a cryptographically random salt for commitments.
     */
    generateSalt(): bigint {
        const bytes = new Uint8Array(31); // < 254-bit BN254 field
        crypto.getRandomValues(bytes);
        let salt = 0n;
        for (let i = 0; i < bytes.length; i++) {
            salt = (salt << 8n) | BigInt(bytes[i]);
        }
        return salt;
    }

    /**
     * Quantize a world coordinate to the grid.
     */
    quantize(value: number): number {
        return Math.floor(value / this.config.gridResolution) * this.config.gridResolution;
    }

    /**
     * Dispose of the Web Worker and free resources.
     */
    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.artifacts.clear();
        this.pendingRequests.clear();
        this.poseidon = null;
        this.F = null;
        this.initialized = false;
        console.log('B3JS ZK: Manager disposed.');
    }
}
