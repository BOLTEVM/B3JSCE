/**
 * B3JS Engine — CeremonyCoordinator
 *
 * Bridges the engine-agnostic ZK ceremony core (@b3js/zk) with the live
 * world: SpacetimeDB multiplayer sync, in-world circuit blueprints, and
 * agentic participants.
 *
 * Architecture:
 *   - `manager` holds the LOCAL, cryptographically verified mirror of all
 *     ceremony state (hash chains are verified on ingest — remote data is
 *     never trusted blindly).
 *   - Write path: actions are computed locally (turn validation, hashing)
 *     and then pushed to SpacetimeDB reducers, which enforce the same
 *     turn-taking rules server-side. Offline play works unchanged —
 *     pushes no-op and the local mirror is the whole truth.
 *   - Read path: SpacetimeManager forwards table rows here; each update
 *     reconstructs the ceremony and feeds it through
 *     CeremonyManager.applyRemoteSnapshot() for verified reconciliation.
 *   - Agents: ZKCeremonyAgent instances registered here receive turn
 *     notifications from BOTH local events and remote table updates.
 *
 * UI integration: the coordinator re-emits everything as DOM events
 * (`b3js:ceremony:*`) so panels and logic bricks stay decoupled.
 */

import {
    CeremonyManager,
    CircuitBuilder,
    ZKCeremonyAgent,
    hashBlueprint,
    makeParticipant,
} from '@b3js/zk';
import type {
    CeremonyContribution,
    CeremonyParticipantKind,
    CircuitBlueprint,
    ZKCeremony,
    ZKCeremonyConfig,
} from '@b3js/zk';
import type { B3Engine } from './index';

/** Shape of a ZKCeremony table row (snake_case, from SpacetimeDB). */
export interface CeremonyRow {
    id: string;
    lobby_id: string;
    name: string;
    circuit_blueprint_id: string;
    blueprint_hash: string;
    phase: string;
    creator_identity: { toHexString(): string };
    config_json: string;
    participants_json: string;
    contribution_count: number | bigint;
    accumulator_hash: string;
    final_parameters_hash: string;
    beacon_hash: string;
    created_at: bigint;
    finalized_at: bigint;
}

export interface ContributionRow {
    id: string;
    ceremony_id: string;
    lobby_id: string;
    idx: number | bigint;
    participant_id: string;
    participant_kind: string;
    prev_accumulator_hash: string;
    entropy_commitment: string;
    accumulator_hash: string;
    transcript_hash: string;
    entropy_source: string;
    duration_ms: number | bigint;
    attestation: string;
    timestamp: bigint;
}

export interface BlueprintRow {
    id: string;
    lobby_id: string;
    name: string;
    blueprint_json: string;
    blueprint_hash: string;
    constraint_count: number;
    creator_identity: { toHexString(): string };
    created_at: bigint;
}

export class CeremonyCoordinator {
    /** Verified local mirror of all ceremony state. */
    public readonly manager: CeremonyManager = new CeremonyManager();

    /** Circuit blueprints known to this client (local-built + remote). */
    public readonly blueprints: Map<string, CircuitBlueprint> = new Map();

    /** Registered agentic participants. */
    public readonly agents: ZKCeremonyAgent[] = [];

    /** Raw remote rows, keyed by id, for reconciliation. */
    private ceremonyRows: Map<string, CeremonyRow> = new Map();
    private contributionRows: Map<string, ContributionRow> = new Map();

    /** Last turn we notified about, per ceremony (dedup agent pings). */
    private lastNotifiedTurn: Map<string, string> = new Map();

    constructor(private engine: B3Engine) {
        // Re-emit manager events as DOM events for UI/logic-brick decoupling
        this.manager.on((event) => {
            this.dispatch(`b3js:ceremony:${event.type}`, event);
        });
    }

    // ─── Identity ────────────────────────────────────────────────

    /** Local participant id: SpacetimeDB identity when online, else a stable anon id. */
    localIdentity(): string {
        const hex = this.engine.spacetime?.identityHex;
        if (hex) return hex;
        let anon = localStorage.getItem('b3js_ceremony_anon_id');
        if (!anon) {
            anon = `anon_${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem('b3js_ceremony_anon_id', anon);
        }
        return anon;
    }

    localDisplayName(): string {
        return (this.engine as any).playerName || 'Player';
    }

    isOnline(): boolean {
        return this.engine.spacetime?.isConnected ?? false;
    }

    // ─── Blueprints ──────────────────────────────────────────────

    /**
     * Publish a circuit built in-game: validates, hashes, stores locally,
     * and pushes to SpacetimeDB so other players (and ceremonies) can use it.
     */
    async publishBlueprint(builder: CircuitBuilder, existingId?: string): Promise<CircuitBlueprint> {
        const problems = builder.validate();
        if (problems.length > 0) {
            throw new Error(`Circuit is invalid:\n  - ${problems.join('\n  - ')}`);
        }

        const bp = builder.toBlueprint(existingId);
        const hash = await hashBlueprint(bp);
        this.blueprints.set(bp.id, bp);

        if (this.isOnline()) {
            const constraintCount = builder.evaluate({}).constraintCount;
            this.engine.spacetime.pushCircuitBlueprint({
                id: bp.id,
                name: bp.name,
                blueprint_json: JSON.stringify(bp),
                blueprint_hash: hash,
                constraint_count: constraintCount,
            });
        }

        this.dispatch('b3js:ceremony:blueprint', { blueprint: bp, hash });
        return bp;
    }

    // ─── Ceremony Actions (write path) ───────────────────────────

    /**
     * Create a ceremony locally, open it, and publish it to the lobby.
     * The genesis accumulator hash is computed deterministically so all
     * peers derive the same chain head.
     */
    async createCeremony(
        name: string,
        blueprintId?: string,
        config: Partial<ZKCeremonyConfig> = {},
    ): Promise<ZKCeremony> {
        const creator = makeParticipant(this.localIdentity(), this.localDisplayName(), 'human');

        let blueprint: { id: string; hash: string } | undefined;
        if (blueprintId) {
            const bp = this.blueprints.get(blueprintId);
            if (!bp) throw new Error(`Blueprint "${blueprintId}" not found — publish it first.`);
            blueprint = { id: bp.id, hash: await hashBlueprint(bp) };
        }

        const ceremony = await this.manager.createCeremony(
            name,
            creator,
            config,
            blueprint,
            this.engine.spacetime?.activeLobbyId ?? undefined,
        );
        this.manager.openCeremony(ceremony.id);

        if (this.isOnline()) {
            this.engine.spacetime.pushCeremonyCreate({
                id: ceremony.id,
                name: ceremony.name,
                circuit_blueprint_id: ceremony.circuitBlueprintId ?? '',
                blueprint_hash: ceremony.blueprintHash ?? '',
                genesis_hash: ceremony.accumulatorHash,
                config_json: JSON.stringify(ceremony.config),
            });
        }

        return ceremony;
    }

    /** Join a ceremony queue (human or agent). */
    joinCeremony(ceremonyId: string, kind: CeremonyParticipantKind = 'human', displayName?: string): void {
        if (this.isOnline()) {
            // Server is authoritative — it echoes the updated queue back.
            this.engine.spacetime.pushCeremonyJoinQueue(
                ceremonyId,
                displayName ?? this.localDisplayName(),
                kind,
            );
        } else {
            const ceremony = this.manager.getCeremony(ceremonyId);
            if (!ceremony) throw new Error(`Ceremony "${ceremonyId}" not found.`);
            this.manager.joinQueue(
                ceremonyId,
                makeParticipant(this.localIdentity(), displayName ?? this.localDisplayName(), kind),
            );
        }
    }

    /** Start a ceremony (creator only, enforced server-side too). */
    startCeremony(ceremonyId: string): void {
        if (this.isOnline()) {
            this.engine.spacetime.pushCeremonyStart(ceremonyId);
        } else {
            this.manager.startCeremony(ceremonyId);
        }
    }

    /**
     * Contribute entropy on the local player's turn.
     * Computes the contribution locally (hash chain), applies it to the
     * mirror, and pushes it to the server. Returns the contribution.
     */
    async contribute(
        ceremonyId: string,
        entropy: Uint8Array,
        opts: { entropySource?: string; attestation?: string } = {},
    ): Promise<CeremonyContribution> {
        const contribution = await this.manager.contribute(
            ceremonyId,
            this.localIdentity(),
            entropy,
            { entropySource: opts.entropySource ?? 'random', attestation: opts.attestation },
        );

        if (this.isOnline()) {
            this.engine.spacetime.pushCeremonyContribution(ceremonyId, {
                entropy_commitment: contribution.entropyCommitment,
                accumulator_hash: contribution.accumulatorHash,
                transcript_hash: contribution.transcriptHash,
                entropy_source: contribution.entropySource,
                duration_ms: contribution.durationMs,
                attestation: contribution.attestation ?? '',
            });
        }

        return contribution;
    }

    /** Finalize a ceremony (creator only). */
    async finalizeCeremony(ceremonyId: string, beacon?: string): Promise<string> {
        const finalHash = await this.manager.finalize(ceremonyId, beacon);
        if (this.isOnline()) {
            this.engine.spacetime.pushCeremonyFinalize(ceremonyId, finalHash, beacon ?? '');
        }
        return finalHash;
    }

    /** Abort a ceremony (creator only). */
    abortCeremony(ceremonyId: string): void {
        if (this.isOnline()) {
            this.engine.spacetime.pushCeremonyAbort(ceremonyId);
        } else {
            this.manager.abort(ceremonyId);
        }
    }

    // ─── Agents ──────────────────────────────────────────────────

    /**
     * Register an agentic participant. The agent receives turn
     * notifications from both the local mirror and remote table updates.
     */
    registerAgent(agent: ZKCeremonyAgent): () => void {
        this.agents.push(agent);
        const detach = agent.attachTo(this.manager);
        this.dispatch('b3js:ceremony:agent', { agentId: agent.participant.id, displayName: agent.participant.displayName });
        return () => {
            detach();
            const i = this.agents.indexOf(agent);
            if (i !== -1) this.agents.splice(i, 1);
        };
    }

    // ─── Remote Reconciliation (read path) ───────────────────────

    /** Called by SpacetimeManager when a ZKCeremony row inserts/updates. */
    async handleCeremonyRow(row: CeremonyRow): Promise<void> {
        this.ceremonyRows.set(row.id, row);
        await this.reconcileCeremony(row.id);
    }

    /** Called by SpacetimeManager when a ZKCeremonyContribution row inserts. */
    async handleContributionRow(row: ContributionRow): Promise<void> {
        this.contributionRows.set(row.id, row);
        await this.reconcileCeremony(row.ceremony_id);
    }

    /** Called by SpacetimeManager when a ZKCircuitBlueprint row inserts/updates. */
    handleBlueprintRow(row: BlueprintRow): void {
        try {
            const bp: CircuitBlueprint = JSON.parse(row.blueprint_json);
            this.blueprints.set(bp.id, bp);
            this.dispatch('b3js:ceremony:blueprint', { blueprint: bp, hash: row.blueprint_hash });
        } catch (e) {
            console.warn('B3JS Ceremony: malformed blueprint row', row.id, e);
        }
    }

    /**
     * Rebuild a ceremony from server rows and merge it into the verified
     * local mirror. Turn notifications fire only when the turn actually
     * changes (deduped), then fan out to UI events and registered agents.
     */
    private async reconcileCeremony(ceremonyId: string): Promise<void> {
        const row = this.ceremonyRows.get(ceremonyId);
        if (!row) return;

        // Filter to our lobby
        const lobbyId = this.engine.spacetime?.activeLobbyId;
        if (lobbyId && row.lobby_id !== lobbyId) return;

        const contributions: CeremonyContribution[] = Array.from(this.contributionRows.values())
            .filter((c) => c.ceremony_id === ceremonyId)
            .sort((a, b) => Number(a.idx) - Number(b.idx))
            .map((c) => ({
                index: Number(c.idx),
                participantId: c.participant_id,
                participantKind: c.participant_kind as CeremonyParticipantKind,
                prevAccumulatorHash: c.prev_accumulator_hash,
                entropyCommitment: c.entropy_commitment,
                accumulatorHash: c.accumulator_hash,
                transcriptHash: c.transcript_hash,
                entropySource: c.entropy_source,
                durationMs: Number(c.duration_ms),
                timestamp: Number(c.timestamp),
                attestation: c.attestation || undefined,
            }));

        let participants: any[] = [];
        let config: ZKCeremonyConfig | undefined;
        try { participants = JSON.parse(row.participants_json); } catch { /* keep empty */ }
        try { config = JSON.parse(row.config_json); } catch { /* keep undefined */ }

        const ceremony: ZKCeremony = {
            id: row.id,
            lobbyId: row.lobby_id,
            name: row.name,
            circuitBlueprintId: row.circuit_blueprint_id || undefined,
            blueprintHash: row.blueprint_hash || undefined,
            phase: row.phase as ZKCeremony['phase'],
            creatorId: row.creator_identity?.toHexString?.() ?? '',
            config: config ?? ({} as ZKCeremonyConfig),
            participants,
            contributions,
            accumulatorHash: row.accumulator_hash,
            createdAt: Number(row.created_at),
            finalizedAt: row.finalized_at ? Number(row.finalized_at) : undefined,
            finalParametersHash: row.final_parameters_hash || undefined,
            beaconHash: row.beacon_hash || undefined,
        };

        const accepted = await this.manager.applyRemoteSnapshot(ceremony);
        if (!accepted) {
            console.warn(`B3JS Ceremony: rejected invalid/stale remote state for "${row.name}"`);
            return;
        }

        this.dispatch('b3js:ceremony:sync', { ceremonyId, phase: ceremony.phase });

        // Turn notification — deduped, fanned out to agents
        if (ceremony.phase === 'running') {
            const current = ceremony.participants[ceremony.contributions.length];
            const turnKey = current ? `${ceremonyId}:${current.id}:${ceremony.contributions.length}` : `${ceremonyId}:none`;
            if (current && this.lastNotifiedTurn.get(ceremonyId) !== turnKey) {
                this.lastNotifiedTurn.set(ceremonyId, turnKey);
                this.dispatch('b3js:ceremony:turn', {
                    ceremonyId,
                    participant: current,
                    index: ceremony.contributions.length,
                });
                for (const agent of this.agents) {
                    agent.handleRemoteTurn(this.manager, ceremonyId, current.id)
                        .then(() => this.pushAgentContributionIfAny(ceremonyId, current.id))
                        .catch((e) => console.warn('B3JS Ceremony: agent turn failed', e));
                }
            }
        }
    }

    /**
     * After an agent contributes to the local mirror in response to a
     * remote turn, push its contribution to the server.
     */
    private async pushAgentContributionIfAny(ceremonyId: string, expectedParticipantId: string): Promise<void> {
        const ceremony = this.manager.getCeremony(ceremonyId);
        if (!ceremony || !this.isOnline()) return;

        const last = ceremony.contributions[ceremony.contributions.length - 1];
        if (!last || last.participantId !== expectedParticipantId) return;
        if (this.contributionRows.has(`${ceremonyId}:${last.index}`)) return;

        this.engine.spacetime.pushCeremonyContribution(ceremonyId, {
            entropy_commitment: last.entropyCommitment,
            accumulator_hash: last.accumulatorHash,
            transcript_hash: last.transcriptHash,
            entropy_source: last.entropySource,
            duration_ms: last.durationMs,
            attestation: last.attestation ?? '',
        });
    }

    // ─── Utility ─────────────────────────────────────────────────

    private dispatch(type: string, detail: any): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        }
    }
}
