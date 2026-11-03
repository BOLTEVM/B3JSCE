/**
 * @b3js/zk tests — ZKCeremonyAgent
 *
 * Covers agentic participation: auto-contribution on turn, deterministic
 * attestation, action planning, and multi-agent ceremonies.
 */

import { describe, test, expect } from 'bun:test';
import { CeremonyManager, makeParticipant, randomEntropy } from '../src/ceremony';
import { ZKCeremonyAgent } from '../src/agent';

describe('ZKCeremonyAgent', () => {
    test('auto-contributes when its turn arrives', async () => {
        const mgr = new CeremonyManager();
        const agent = new ZKCeremonyAgent('bot-1', 'Bot One', 'seed-alpha');
        agent.attachTo(mgr);

        const c = await mgr.createCeremony('Auto', makeParticipant('host', 'Host'));
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('alice', 'Alice'));
        mgr.joinQueue(c.id, agent.participant);
        mgr.startCeremony(c.id);

        // Human goes first
        await mgr.contribute(c.id, 'alice', randomEntropy(32));

        // The agent's turn event fires → auto-contribution
        await new Promise((r) => setTimeout(r, 50));

        const ceremony = mgr.getCeremony(c.id)!;
        expect(ceremony.contributions.length).toBe(2);
        expect(ceremony.contributions[1].participantId).toBe('bot-1');
        expect(ceremony.contributions[1].entropySource).toBe('agent-seed');
        expect(ceremony.phase).toBe('finalizing');
        expect(agent.contributionHistory.length).toBe(1);
    });

    test('agent contributions are attestable (seed-reproducible entropy)', async () => {
        const mgr = new CeremonyManager();
        const agent = new ZKCeremonyAgent('bot-2', 'Bot Two', 'seed-beta');
        agent.autoContribute = false;

        const c = await mgr.createCeremony('Attest', makeParticipant('host', 'Host'));
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, agent.participant);
        mgr.startCeremony(c.id);

        await agent.contributeNow(mgr, c.id);
        expect(await agent.attest(mgr, c.id, 0)).toBe(true);

        // A different agent cannot reproduce it
        const other = new ZKCeremonyAgent('bot-3', 'Bot Three', 'seed-gamma');
        expect(await other.attest(mgr, c.id, 0)).toBe(false);
    });

    test('planAction walks the lifecycle', async () => {
        const mgr = new CeremonyManager();
        const agent = new ZKCeremonyAgent('bot-4', 'Bot Four', 'seed-delta');
        agent.autoContribute = false;

        expect(agent.planAction(undefined).kind).toBe('wait');

        const c = await mgr.createCeremony('Plan', makeParticipant('host', 'Host'));
        expect(agent.planAction(mgr.getCeremony(c.id), mgr)).toEqual({ kind: 'wait', reason: 'ceremony not open yet' });

        mgr.openCeremony(c.id);
        expect(agent.planAction(mgr.getCeremony(c.id), mgr).kind).toBe('join_queue');

        mgr.joinQueue(c.id, agent.participant);
        expect(agent.planAction(mgr.getCeremony(c.id), mgr)).toEqual({ kind: 'wait', reason: 'in queue, waiting for ceremony start' });

        mgr.startCeremony(c.id);
        expect(agent.planAction(mgr.getCeremony(c.id), mgr).kind).toBe('contribute');

        await agent.contributeNow(mgr, c.id);
        expect(agent.planAction(mgr.getCeremony(c.id), mgr).kind).toBe('wait'); // finalizing

        await mgr.finalize(c.id);
        expect(agent.planAction(mgr.getCeremony(c.id), mgr).kind).toBe('done');
    });

    test('multi-agent ceremony completes without human input', async () => {
        const mgr = new CeremonyManager();
        const agents = [
            new ZKCeremonyAgent('a1', 'Agent 1', 's1'),
            new ZKCeremonyAgent('a2', 'Agent 2', 's2'),
            new ZKCeremonyAgent('a3', 'Agent 3', 's3'),
        ];
        agents.forEach((a) => a.attachTo(mgr));

        const c = await mgr.createCeremony('Bot-Only', makeParticipant('a1', 'Agent 1', 'agent'));
        mgr.openCeremony(c.id);
        agents.forEach((a) => mgr.joinQueue(c.id, a.participant));
        mgr.startCeremony(c.id);

        // First agent's turn fires synchronously on start; chain the rest
        await new Promise((r) => setTimeout(r, 200));

        const ceremony = mgr.getCeremony(c.id)!;
        expect(ceremony.contributions.length).toBe(3);
        expect(ceremony.phase).toBe('finalizing');

        // Every contribution verifies, and each agent can attest its own
        for (let i = 0; i < 3; i++) {
            expect(await mgr.verifyContribution(c.id, i)).toBe(true);
            expect(await agents[i].attest(mgr, c.id, i)).toBe(true);
        }

        const transcript = mgr.exportTranscript(c.id);
        const result = await mgr.verifyTranscript(transcript);
        expect(result.valid).toBe(true);
    });

    test('handleRemoteTurn drives contribution once per turn', async () => {
        const mgr = new CeremonyManager();
        const agent = new ZKCeremonyAgent('bot-5', 'Bot Five', 'seed-epsilon');

        const c = await mgr.createCeremony('Remote', makeParticipant('host', 'Host'));
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, agent.participant);
        mgr.startCeremony(c.id);

        await agent.handleRemoteTurn(mgr, c.id, 'bot-5');
        expect(mgr.getCeremony(c.id)!.contributions.length).toBe(1);

        // Duplicate remote turn notification is ignored
        await agent.handleRemoteTurn(mgr, c.id, 'bot-5');
        expect(mgr.getCeremony(c.id)!.contributions.length).toBe(1);

        // Other participant's turn is ignored
        await agent.handleRemoteTurn(mgr, c.id, 'someone-else');
        expect(mgr.getCeremony(c.id)!.contributions.length).toBe(1);
    });
});
