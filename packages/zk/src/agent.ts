/**
 * @b3js/zk — ZKCeremonyAgent
 *
 * Scripted / agentic ceremony participation. An agent wraps a participant
 * identity plus a seed, and can:
 *
 *   - Watch a CeremonyManager and automatically contribute when its turn
 *     arrives (auto-drive for bots and AI players).
 *   - Derive deterministic, seed-bound entropy (reproducible and later
 *     attestable via attestContribution()).
 *   - Inspect ceremony state and plan its next action (decision surface
 *     for LLM-driven agents — they call planAction(), decide, then act).
 *
 * In multiplayer worlds the engine layer routes SpacetimeDB turn
 * notifications to handleRemoteTurn(), giving agents the exact same
 * affordances as human players.
 */

import type {
    CeremonyContribution,
    CeremonyParticipant,
    ZKCeremony,
} from './types';
import { CeremonyManager, agentEntropy, makeParticipant } from './ceremony';

/** What the agent believes it should do next. */
export type AgentAction =
    | { kind: 'wait'; reason: string }
    | { kind: 'join_queue'; ceremonyId: string }
    | { kind: 'contribute'; ceremonyId: string }
    | { kind: 'done'; ceremonyId: string };

export class ZKCeremonyAgent {
    public readonly participant: CeremonyParticipant;
    /** When true, the agent contributes the moment its turn arrives. */
    public autoContribute: boolean = true;
    /** Public attestation attached to each contribution. */
    public attestation: string = '';
    /** History of contributions made by this agent. */
    public readonly contributionHistory: CeremonyContribution[] = [];

    private detachFns: Array<() => void> = [];
    private pending: Set<string> = new Set();

    constructor(id: string, displayName: string, public readonly seed: string) {
        this.participant = makeParticipant(id, displayName, 'agent');
    }

    /**
     * Subscribe to a CeremonyManager; when autoContribute is enabled the
     * agent fires its contribution as soon as the turn event names it.
     * Returns an unsubscribe function.
     */
    attachTo(manager: CeremonyManager): () => void {
        const detach = manager.on(async (event) => {
            if (!this.autoContribute) return;
            if (event.type !== 'turn' || !event.participant) return;
            if (event.participant.id !== this.participant.id) return;
            if (this.pending.has(event.ceremonyId)) return;

            this.pending.add(event.ceremonyId);
            try {
                await this.contributeNow(manager, event.ceremonyId);
            } catch (e) {
                console.warn(`ZKCeremonyAgent ${this.participant.id}: contribution failed`, e);
            } finally {
                this.pending.delete(event.ceremonyId);
            }
        });
        this.detachFns.push(detach);
        return detach;
    }

    /**
     * Contribute to a ceremony right now (turn-validated by the manager).
     * Entropy is derived from (agent seed, ceremony id, contribution index)
     * so it is unique per contribution yet reproducible for attestation.
     */
    async contributeNow(manager: CeremonyManager, ceremonyId: string): Promise<CeremonyContribution> {
        const ceremony = manager.getCeremony(ceremonyId);
        if (!ceremony) throw new Error(`ZKCeremonyAgent: ceremony "${ceremonyId}" not found.`);

        const index = ceremony.contributions.length;
        const entropy = await agentEntropy(`${this.seed}:${ceremonyId}:${index}`);
        const startedAt = Date.now();

        const contribution = await manager.contribute(ceremonyId, this.participant.id, entropy, {
            entropySource: 'agent-seed',
            attestation: this.attestation ||
                `agent ${this.participant.displayName} seed-bound contribution #${index}`,
            durationMs: Date.now() - startedAt,
        });

        this.contributionHistory.push(contribution);
        return contribution;
    }

    /**
     * Reveal the entropy used for one of this agent's contributions —
     * produces a publicly verifiable attestation of honest participation.
     */
    async attest(manager: CeremonyManager, ceremonyId: string, index: number): Promise<boolean> {
        const entropy = await agentEntropy(`${this.seed}:${ceremonyId}:${index}`);
        return manager.attestContribution(ceremonyId, index, entropy);
    }

    /**
     * Decision surface for LLM-driven agents: given what the agent can see,
     * what should it do next? The caller (a model, a planner, a script)
     * is free to follow or override the suggestion.
     */
    planAction(ceremony: ZKCeremony | undefined, manager?: CeremonyManager): AgentAction {
        if (!ceremony) return { kind: 'wait', reason: 'ceremony not found' };

        const inQueue = ceremony.participants.some((p) => p.id === this.participant.id);

        switch (ceremony.phase) {
            case 'draft':
                return { kind: 'wait', reason: 'ceremony not open yet' };
            case 'open':
                return inQueue
                    ? { kind: 'wait', reason: 'in queue, waiting for ceremony start' }
                    : { kind: 'join_queue', ceremonyId: ceremony.id };
            case 'running': {
                if (!inQueue) return { kind: 'wait', reason: 'not a participant' };
                const current = manager?.getCurrentTurn(ceremony.id);
                if (current?.id === this.participant.id) {
                    return { kind: 'contribute', ceremonyId: ceremony.id };
                }
                return {
                    kind: 'wait',
                    reason: current ? `waiting on ${current.displayName}` : 'waiting for turn assignment',
                };
            }
            case 'finalizing':
                return { kind: 'wait', reason: 'awaiting finalization beacon' };
            case 'finalized':
                return { kind: 'done', ceremonyId: ceremony.id };
            case 'aborted':
                return { kind: 'done', ceremonyId: ceremony.id };
        }
    }

    /**
     * Handle a turn notification arriving from a remote transport
     * (SpacetimeDB table subscription in the engine layer).
     */
    async handleRemoteTurn(
        manager: CeremonyManager,
        ceremonyId: string,
        participantId: string,
    ): Promise<void> {
        if (!this.autoContribute) return;
        if (participantId !== this.participant.id) return;
        if (this.pending.has(ceremonyId)) return;
        // Idempotency: remote notifications may be duplicated or stale —
        // trust the manager's turn state over the notification.
        const current = manager.getCurrentTurn(ceremonyId);
        if (current?.id !== this.participant.id) return;
        this.pending.add(ceremonyId);
        try {
            await this.contributeNow(manager, ceremonyId);
        } catch (e) {
            console.warn(`ZKCeremonyAgent ${this.participant.id}: remote turn contribution failed`, e);
        } finally {
            this.pending.delete(ceremonyId);
        }
    }

    /** Unsubscribe from all attached managers. */
    dispose(): void {
        for (const detach of this.detachFns) detach();
        this.detachFns = [];
    }
}
