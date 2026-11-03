/**
 * @b3js/zk — CeremonyManager
 *
 * Multi-party computation (trusted setup) ceremonies as a first-class,
 * engine-agnostic system. A ceremony is a sequential hash-chain protocol:
 *
 *   1. A creator binds a ceremony to a circuit blueprint (hash).
 *   2. Participants (humans and agents) join a queue — order is turn order.
 *   3. Each contributor, on their turn, mixes SECRET entropy into the
 *      accumulator:  accᵢ = SHA256(accᵢ₋₁ ‖ SHA256(entropyᵢ))
 *      Only the entropy commitment is published; the entropy itself never
 *      leaves the contributor's machine. Security model: as long as ONE
 *      participant destroys their entropy, the final parameters are safe.
 *   4. Every contribution extends a publicly verifiable transcript.
 *   5. Finalization optionally mixes a public beacon (e.g. a blockhash)
 *      to produce the final parameters hash.
 *
 * The manager works standalone (local/solo ceremonies, tests, offline play)
 * and accepts a pluggable transport for multiplayer sync (SpacetimeDB in
 * the engine layer). Agentic participants use the same API surface —
 * see agent.ts for a scripted participant driver.
 */

import type {
    CeremonyContribution,
    CeremonyEvent,
    CeremonyEventListener,
    CeremonyParticipant,
    CeremonyParticipantKind,
    CeremonyPhase,
    ZKCeremony,
    ZKCeremonyConfig,
} from './types';
import { DEFAULT_CEREMONY_CONFIG } from './types';
import { sha256Hex } from './circuitbuilder';

let ceremonyIdSeq = 0;
function nextId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${(ceremonyIdSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Entropy source tags for transcript auditing. */
export type EntropySource = 'random' | 'mouse' | 'agent-seed' | 'hardware';

export interface ContributeOptions {
    /** How the entropy was gathered — recorded in the transcript. */
    entropySource?: EntropySource | string;
    /** Optional public attestation text ("I contributed from the Sanctum"). */
    attestation?: string;
    /** Measured wall-clock time the contribution took. */
    durationMs?: number;
}

export class CeremonyManager {
    private ceremonies: Map<string, ZKCeremony> = new Map();
    private listeners: CeremonyEventListener[] = [];
    private turnStartTimes: Map<string, number> = new Map();

    // ─── Events ──────────────────────────────────────────────────

    on(listener: CeremonyEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    private emit(event: CeremonyEvent): void {
        for (const l of this.listeners) l(event);
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    /**
     * Create a ceremony in 'draft' phase.
     * @param blueprintHash  SHA-256 of the circuit blueprint (hashBlueprint()).
     *                       Binds this ceremony to one exact circuit design.
     */
    async createCeremony(
        name: string,
        creator: CeremonyParticipant,
        config: Partial<ZKCeremonyConfig> = {},
        blueprint?: { id: string; hash: string },
        lobbyId?: string,
    ): Promise<ZKCeremony> {
        const id = nextId('ceremony');
        const genesis = await this.computeGenesisHash(id, blueprint?.hash);
        const ceremony: ZKCeremony = {
            id,
            lobbyId,
            name,
            circuitBlueprintId: blueprint?.id,
            blueprintHash: blueprint?.hash,
            phase: 'draft',
            creatorId: creator.id,
            config: { ...DEFAULT_CEREMONY_CONFIG, ...config },
            participants: [],
            contributions: [],
            accumulatorHash: genesis,
            createdAt: Date.now(),
        };
        this.ceremonies.set(id, ceremony);
        return ceremony;
    }

    /** Deterministic genesis accumulator — reproducible by any verifier. */
    private async computeGenesisHash(ceremonyId: string, blueprintHash?: string): Promise<string> {
        return sha256Hex(`b3js-ceremony-genesis:${ceremonyId}:${blueprintHash ?? 'none'}`);
    }

    /** Draft → open: participants may now join the queue. */
    openCeremony(ceremonyId: string): void {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'draft');
        c.phase = 'open';
        this.emit({ type: 'phase', ceremonyId, phase: 'open' });
    }

    /** Open → running: locks the queue and starts the contribution chain. */
    startCeremony(ceremonyId: string): void {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'open');
        if (c.participants.length === 0) {
            throw new Error('CeremonyManager: cannot start with an empty queue.');
        }
        c.phase = 'running';
        this.turnStartTimes.set(ceremonyId, Date.now());
        this.emit({ type: 'phase', ceremonyId, phase: 'running' });
        this.emit({ type: 'turn', ceremonyId, participant: c.participants[0], index: 0 });
    }

    // ─── Queue ───────────────────────────────────────────────────

    /** Join the contribution queue. Returns queue position (0-based). */
    joinQueue(ceremonyId: string, participant: CeremonyParticipant): number {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'open');
        if (c.config.maxContributors > 0 && c.participants.length >= c.config.maxContributors) {
            throw new Error('CeremonyManager: ceremony queue is full.');
        }
        if (c.participants.some((p) => p.id === participant.id)) {
            throw new Error(`CeremonyManager: "${participant.id}" is already in the queue.`);
        }
        c.participants.push(participant);
        this.emit({ type: 'participant_joined', ceremonyId, participant });
        return c.participants.length - 1;
    }

    /** Leave the queue (only while open — once running, order is locked). */
    leaveQueue(ceremonyId: string, participantId: string): void {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'open');
        c.participants = c.participants.filter((p) => p.id !== participantId);
    }

    /** Whose turn is it? Null when not running or queue exhausted. */
    getCurrentTurn(ceremonyId: string): CeremonyParticipant | null {
        const c = this.mustGet(ceremonyId);
        if (c.phase !== 'running') return null;
        return c.participants[c.contributions.length] ?? null;
    }

    // ─── Contribution ────────────────────────────────────────────

    /**
     * Contribute entropy on your turn.
     *
     * @param entropy  Secret bytes (≥ config.minEntropyBytes). Never stored —
     *                 only its SHA-256 commitment enters the transcript.
     */
    async contribute(
        ceremonyId: string,
        participantId: string,
        entropy: Uint8Array,
        opts: ContributeOptions = {},
    ): Promise<CeremonyContribution> {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'running');

        if (entropy.length < c.config.minEntropyBytes) {
            throw new Error(
                `CeremonyManager: entropy too short (${entropy.length} < ${c.config.minEntropyBytes} bytes).`,
            );
        }

        const expected = c.participants[c.contributions.length];
        if (!expected) throw new Error('CeremonyManager: contribution round is already complete.');
        if (expected.id !== participantId) {
            throw new Error(
                `CeremonyManager: not your turn — waiting on "${expected.displayName}" (${expected.id}).`,
            );
        }

        // Turn timeout enforcement
        if (c.config.turnTimeoutMs > 0) {
            const turnStart = this.turnStartTimes.get(ceremonyId) ?? Date.now();
            if (Date.now() - turnStart > c.config.turnTimeoutMs) {
                this.abort(ceremonyId, `turn timeout by ${expected.displayName}`);
                throw new Error('CeremonyManager: turn timed out — ceremony aborted.');
            }
        }

        const index = c.contributions.length;
        const prevAccumulatorHash = c.accumulatorHash;
        const entropyCommitment = await sha256Hex(entropy);
        const accumulatorHash = await sha256Hex(`${prevAccumulatorHash}:${entropyCommitment}`);
        const transcriptLine = `${ceremonyId}:${index}:${participantId}:${prevAccumulatorHash}:${entropyCommitment}:${accumulatorHash}`;
        const transcriptHash = await sha256Hex(transcriptLine);

        const contribution: CeremonyContribution = {
            index,
            participantId,
            participantKind: expected.kind,
            prevAccumulatorHash,
            entropyCommitment,
            accumulatorHash,
            transcriptHash,
            entropySource: opts.entropySource ?? 'random',
            durationMs: opts.durationMs ?? 0,
            timestamp: Date.now(),
            attestation: opts.attestation,
        };

        c.contributions.push(contribution);
        c.accumulatorHash = accumulatorHash;
        this.emit({ type: 'contribution', ceremonyId, contribution });

        if (c.contributions.length >= c.participants.length) {
            c.phase = 'finalizing';
            this.turnStartTimes.delete(ceremonyId);
            this.emit({ type: 'phase', ceremonyId, phase: 'finalizing' });
            this.emit({ type: 'turn', ceremonyId, participant: null, index: -1 });
        } else {
            this.turnStartTimes.set(ceremonyId, Date.now());
            const next = c.participants[c.contributions.length];
            this.emit({ type: 'turn', ceremonyId, participant: next, index: c.contributions.length });
        }

        return contribution;
    }

    /**
     * Verify a single contribution's linkage within the chain.
     * (Confirms hash-chain consistency — entropy secrecy is by design
     * unverifiable until/unless the contributor reveals it.)
     */
    async verifyContribution(ceremonyId: string, index: number): Promise<boolean> {
        const c = this.mustGet(ceremonyId);
        const contribution = c.contributions[index];
        if (!contribution) return false;

        // Linkage: previous accumulator matches
        const expectedPrev = index === 0
            ? await this.computeGenesisHash(ceremonyId, c.blueprintHash)
            : c.contributions[index - 1].accumulatorHash;
        if (contribution.prevAccumulatorHash !== expectedPrev) return false;

        // Accumulator derivation
        const acc = await sha256Hex(`${contribution.prevAccumulatorHash}:${contribution.entropyCommitment}`);
        if (acc !== contribution.accumulatorHash) return false;

        // Transcript line
        const line = `${ceremonyId}:${index}:${contribution.participantId}:${contribution.prevAccumulatorHash}:${contribution.entropyCommitment}:${contribution.accumulatorHash}`;
        return (await sha256Hex(line)) === contribution.transcriptHash;
    }

    /**
     * Allow a past contributor to prove honest participation by revealing
     * their entropy. Recomputes the commitment and chain link.
     */
    async attestContribution(
        ceremonyId: string,
        index: number,
        revealedEntropy: Uint8Array,
    ): Promise<boolean> {
        const c = this.mustGet(ceremonyId);
        const contribution = c.contributions[index];
        if (!contribution) return false;
        const commitment = await sha256Hex(revealedEntropy);
        return commitment === contribution.entropyCommitment;
    }

    // ─── Finalization ────────────────────────────────────────────

    /**
     * Finalize: mix an optional public beacon into the accumulator and
     * produce the final parameters hash. This is what proofs generated
     * under this ceremony are bound to.
     *
     * @param beacon  Public randomness (e.g. a future blockhash) as hex
     *                or UTF-8. Required when config.requireBeacon is set.
     */
    async finalize(ceremonyId: string, beacon?: string): Promise<string> {
        const c = this.mustGet(ceremonyId);
        this.requirePhase(c, 'finalizing');

        if (c.config.requireBeacon && !beacon) {
            throw new Error('CeremonyManager: this ceremony requires a public beacon to finalize.');
        }

        const finalParametersHash = beacon
            ? await sha256Hex(`${c.accumulatorHash}:beacon:${beacon}`)
            : c.accumulatorHash;

        c.phase = 'finalized';
        c.finalizedAt = Date.now();
        c.finalParametersHash = finalParametersHash;
        c.beaconHash = beacon;
        this.emit({ type: 'phase', ceremonyId, phase: 'finalized' });
        this.emit({ type: 'finalized', ceremonyId, finalParametersHash });
        return finalParametersHash;
    }

    /** Abort a ceremony (host action or timeout). */
    abort(ceremonyId: string, _reason?: string): void {
        const c = this.mustGet(ceremonyId);
        if (c.phase === 'finalized') throw new Error('CeremonyManager: cannot abort a finalized ceremony.');
        c.phase = 'aborted';
        this.turnStartTimes.delete(ceremonyId);
        this.emit({ type: 'phase', ceremonyId, phase: 'aborted' });
    }

    // ─── Transcript Export / Verification ────────────────────────

    /**
     * Export the full public transcript — anyone with this JSON can
     * independently verify the entire ceremony chain.
     */
    exportTranscript(ceremonyId: string): string {
        const c = this.mustGet(ceremonyId);
        return JSON.stringify(
            {
                format: 'b3js-ceremony-transcript@1',
                ceremony: {
                    id: c.id,
                    name: c.name,
                    circuitBlueprintId: c.circuitBlueprintId,
                    blueprintHash: c.blueprintHash,
                    phase: c.phase,
                    config: c.config,
                    participants: c.participants,
                    finalParametersHash: c.finalParametersHash,
                    beaconHash: c.beaconHash,
                },
                contributions: c.contributions,
            },
            null,
            2,
        );
    }

    /**
     * Independently verify an exported transcript: recomputes the genesis
     * hash, every chain link, every transcript hash, and the finalization.
     */
    async verifyTranscript(transcriptJSON: string): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        let data: any;
        try {
            data = JSON.parse(transcriptJSON);
        } catch {
            return { valid: false, errors: ['Transcript is not valid JSON.'] };
        }

        if (data.format !== 'b3js-ceremony-transcript@1') {
            errors.push(`Unknown transcript format: ${data.format}`);
            return { valid: false, errors };
        }

        const meta = data.ceremony;
        const contributions: CeremonyContribution[] = data.contributions ?? [];

        // Genesis
        let expectedAcc = await this.computeGenesisHash(meta.id, meta.blueprintHash);

        for (let i = 0; i < contributions.length; i++) {
            const c = contributions[i];
            if (c.index !== i) errors.push(`Contribution ${i}: wrong index (${c.index}).`);
            if (c.prevAccumulatorHash !== expectedAcc) {
                errors.push(`Contribution ${i}: prev accumulator mismatch (chain broken).`);
            }
            const acc = await sha256Hex(`${c.prevAccumulatorHash}:${c.entropyCommitment}`);
            if (acc !== c.accumulatorHash) {
                errors.push(`Contribution ${i}: accumulator derivation mismatch.`);
            }
            const line = `${meta.id}:${i}:${c.participantId}:${c.prevAccumulatorHash}:${c.entropyCommitment}:${c.accumulatorHash}`;
            if ((await sha256Hex(line)) !== c.transcriptHash) {
                errors.push(`Contribution ${i}: transcript hash mismatch.`);
            }
            // Participant must be the i-th in queue
            if (meta.participants?.[i]?.id && meta.participants[i].id !== c.participantId) {
                errors.push(`Contribution ${i}: contributed by ${c.participantId}, expected ${meta.participants[i].id}.`);
            }
            expectedAcc = c.accumulatorHash;
        }

        // Finalization
        if (meta.finalParametersHash) {
            const expectedFinal = meta.beaconHash
                ? await sha256Hex(`${expectedAcc}:beacon:${meta.beaconHash}`)
                : expectedAcc;
            if (expectedFinal !== meta.finalParametersHash) {
                errors.push('Final parameters hash mismatch.');
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // ─── Accessors ───────────────────────────────────────────────

    getCeremony(id: string): ZKCeremony | undefined {
        return this.ceremonies.get(id);
    }

    listCeremonies(): ZKCeremony[] {
        return Array.from(this.ceremonies.values());
    }

    /**
     * Merge a remote ceremony snapshot (multiplayer sync). The remote
     * state's chain is verified before acceptance — a tampered snapshot
     * is rejected rather than silently trusted.
     */
    async applyRemoteSnapshot(ceremony: ZKCeremony): Promise<boolean> {
        const local = this.ceremonies.get(ceremony.id);

        // Verify the incoming chain is internally consistent
        let expectedAcc = await this.computeGenesisHash(ceremony.id, ceremony.blueprintHash);
        for (let i = 0; i < ceremony.contributions.length; i++) {
            const c = ceremony.contributions[i];
            if (c.prevAccumulatorHash !== expectedAcc) return false;
            const acc = await sha256Hex(`${c.prevAccumulatorHash}:${c.entropyCommitment}`);
            if (acc !== c.accumulatorHash) return false;
            expectedAcc = c.accumulatorHash;
        }
        if (expectedAcc !== ceremony.accumulatorHash) return false;

        // Accept if newer (more contributions) or unknown
        if (!local || ceremony.contributions.length >= local.contributions.length) {
            this.ceremonies.set(ceremony.id, ceremony);
            return true;
        }
        return false;
    }

    private mustGet(ceremonyId: string): ZKCeremony {
        const c = this.ceremonies.get(ceremonyId);
        if (!c) throw new Error(`CeremonyManager: ceremony "${ceremonyId}" not found.`);
        return c;
    }

    private requirePhase(c: ZKCeremony, phase: CeremonyPhase): void {
        if (c.phase !== phase) {
            throw new Error(`CeremonyManager: "${c.name}" is in phase "${c.phase}", expected "${phase}".`);
        }
    }
}

// ─── Entropy Helpers ─────────────────────────────────────────────

/** Cryptographically secure random entropy (browser + Bun + Node). */
export function randomEntropy(bytes: number = 32): Uint8Array {
    const out = new Uint8Array(bytes);
    crypto.getRandomValues(out);
    return out;
}

/**
 * Build entropy from mouse/touch movement samples — the classic ceremony
 * mini-game ("wiggle your mouse to forge randomness"). Each sample mixes
 * coordinates and timing into a rolling accumulator; call digest() when
 * enough samples are collected.
 */
export class MouseEntropyCollector {
    private state: number[] = new Array(64).fill(0);
    private sampleCount = 0;

    constructor(public readonly minSamples: number = 256) {}

    addSample(x: number, y: number): void {
        const t = Date.now() & 0xffff;
        const i = this.sampleCount % this.state.length;
        this.state[i] = (this.state[i] * 31 + (x | 0) * 7 + (y | 0) * 13 + t) >>> 0;
        this.sampleCount++;
    }

    get progress(): number {
        return Math.min(1, this.sampleCount / this.minSamples);
    }

    get samples(): number {
        return this.sampleCount;
    }

    get ready(): boolean {
        return this.sampleCount >= this.minSamples;
    }

    async digest(): Promise<Uint8Array> {
        // Mix collected samples with CSPRNG output — mouse entropy alone is
        // weak; the combination is at least as strong as the CSPRNG.
        const random = randomEntropy(32);
        const mixed = await sha256Hex(
            JSON.stringify({ s: this.state, r: Array.from(random) }),
        );
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i++) out[i] = parseInt(mixed.slice(i * 2, i * 2 + 2), 16);
        return out;
    }
}

/** Deterministic entropy for agentic participants (seeded, reproducible). */
export async function agentEntropy(seed: string): Promise<Uint8Array> {
    const hex = await sha256Hex(`b3js-agent-entropy:${seed}`);
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

/** Convenience factory for participant records. */
export function makeParticipant(
    id: string,
    displayName: string,
    kind: CeremonyParticipantKind = 'human',
): CeremonyParticipant {
    return { id, displayName, kind, joinedAt: Date.now() };
}
