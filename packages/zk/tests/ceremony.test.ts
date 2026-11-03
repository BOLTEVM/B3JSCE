/**
 * @b3js/zk tests — CeremonyManager
 *
 * Covers the full ceremony lifecycle: create → open → queue → run →
 * contribute → finalize, plus verification, attestation, transcript
 * export, tamper detection, and multi-participant (human + agent) play.
 */

import { describe, test, expect } from 'bun:test';
import {
    CeremonyManager,
    MouseEntropyCollector,
    agentEntropy,
    makeParticipant,
    randomEntropy,
} from '../src/ceremony';
import type { CeremonyEvent, ZKCeremony } from '../src/types';

async function makeRunningCeremony(
    mgr: CeremonyManager,
    participantIds: string[],
    kinds: Array<'human' | 'agent'> = [],
): Promise<ZKCeremony> {
    const creator = { id: participantIds[0], displayName: participantIds[0], kind: (kinds[0] ?? 'human') as 'human' | 'agent', joinedAt: Date.now() };
    const c = await mgr.createCeremony('Test Ceremony', creator, {}, { id: 'bp1', hash: 'abc123' });
    mgr.openCeremony(c.id);
    for (let i = 0; i < participantIds.length; i++) {
        mgr.joinQueue(c.id, {
            id: participantIds[i],
            displayName: participantIds[i],
            kind: kinds[i] ?? 'human',
            joinedAt: Date.now(),
        });
    }
    mgr.startCeremony(c.id);
    return mgr.getCeremony(c.id)!;
}

describe('CeremonyManager', () => {
    test('full lifecycle: create → open → join → start → contribute → finalize', async () => {
        const mgr = new CeremonyManager();
        const events: CeremonyEvent[] = [];
        mgr.on((e) => events.push(e));

        const creator = makeParticipant('alice', 'Alice');
        const c = await mgr.createCeremony('Loot Circuit Ceremony', creator, { requireBeacon: true }, { id: 'bp_loot', hash: 'deadbeef' });
        expect(c.phase).toBe('draft');

        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('alice', 'Alice'));
        mgr.joinQueue(c.id, makeParticipant('bob', 'Bob'));
        mgr.joinQueue(c.id, makeParticipant('agent-7', 'Agent 7', 'agent'));

        mgr.startCeremony(c.id);
        expect(mgr.getCurrentTurn(c.id)?.id).toBe('alice');

        const c1 = await mgr.contribute(c.id, 'alice', randomEntropy(32));
        expect(c1.index).toBe(0);
        expect(mgr.getCurrentTurn(c.id)?.id).toBe('bob');

        await mgr.contribute(c.id, 'bob', randomEntropy(32), { entropySource: 'mouse' });
        expect(mgr.getCurrentTurn(c.id)?.id).toBe('agent-7');

        await mgr.contribute(c.id, 'agent-7', await agentEntropy('agent-7-seed'), { entropySource: 'agent-seed' });

        // Queue exhausted → finalizing
        expect(mgr.getCeremony(c.id)!.phase).toBe('finalizing');
        expect(mgr.getCurrentTurn(c.id)).toBeNull();

        const finalHash = await mgr.finalize(c.id, 'blockhash-0xfeed');
        expect(typeof finalHash).toBe('string');
        expect(mgr.getCeremony(c.id)!.phase).toBe('finalized');
        expect(mgr.getCeremony(c.id)!.finalParametersHash).toBe(finalHash);

        // Event stream sanity
        const phases = events.filter((e) => e.type === 'phase').map((e) => (e as any).phase);
        expect(phases).toEqual(['open', 'running', 'finalizing', 'finalized']);
        expect(events.filter((e) => e.type === 'contribution').length).toBe(3);
        const turns = events.filter((e) => e.type === 'turn');
        expect(turns.length).toBe(4); // alice, bob, agent-7, null
    });

    test('out-of-turn contribution is rejected', async () => {
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['alice', 'bob']);
        await expect(mgr.contribute(c.id, 'bob', randomEntropy(32))).rejects.toThrow('not your turn');
    });

    test('weak entropy is rejected', async () => {
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['alice']);
        await expect(mgr.contribute(c.id, 'alice', new Uint8Array(8))).rejects.toThrow('entropy too short');
    });

    test('duplicate queue join is rejected; leaving works while open', async () => {
        const mgr = new CeremonyManager();
        const c = await mgr.createCeremony('Q', makeParticipant('host', 'Host'));
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('alice', 'Alice'));
        expect(() => mgr.joinQueue(c.id, makeParticipant('alice', 'Alice'))).toThrow('already in the queue');
        mgr.leaveQueue(c.id, 'alice');
        expect(mgr.getCeremony(c.id)!.participants.length).toBe(0);
    });

    test('queue cap is enforced', async () => {
        const mgr = new CeremonyManager();
        const c = await mgr.createCeremony('Capped', makeParticipant('host', 'Host'), { maxContributors: 1 });
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('a', 'A'));
        expect(() => mgr.joinQueue(c.id, makeParticipant('b', 'B'))).toThrow('full');
    });

    test('starting an empty ceremony fails', async () => {
        const mgr = new CeremonyManager();
        const c = await mgr.createCeremony('Empty', makeParticipant('host', 'Host'));
        mgr.openCeremony(c.id);
        expect(() => mgr.startCeremony(c.id)).toThrow('empty queue');
    });

    test('finalize without required beacon fails', async () => {
        const mgr = new CeremonyManager();
        const creator = makeParticipant('a', 'A');
        const c = await mgr.createCeremony('Beacon', creator, { requireBeacon: true });
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('a', 'A'));
        mgr.startCeremony(c.id);
        await mgr.contribute(c.id, 'a', randomEntropy(32));
        await expect(mgr.finalize(c.id)).rejects.toThrow('beacon');
    });

    test('every contribution verifies; tampering is detected', async () => {
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['alice', 'bob', 'carol']);
        await mgr.contribute(c.id, 'alice', randomEntropy(32));
        await mgr.contribute(c.id, 'bob', randomEntropy(32));
        await mgr.contribute(c.id, 'carol', randomEntropy(32));

        for (let i = 0; i < 3; i++) {
            expect(await mgr.verifyContribution(c.id, i)).toBe(true);
        }

        // Tamper with a contribution
        mgr.getCeremony(c.id)!.contributions[1].entropyCommitment = 'ff'.repeat(32);
        expect(await mgr.verifyContribution(c.id, 1)).toBe(false);
    });

    test('entropy reveal attests honest participation', async () => {
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['alice']);
        const entropy = randomEntropy(32);
        await mgr.contribute(c.id, 'alice', entropy);

        expect(await mgr.attestContribution(c.id, 0, entropy)).toBe(true);
        expect(await mgr.attestContribution(c.id, 0, randomEntropy(32))).toBe(false);
    });

    test('transcript export verifies; tampered transcript fails', async () => {
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['alice', 'bob'], ['human', 'agent']);
        await mgr.contribute(c.id, 'alice', randomEntropy(32));
        await mgr.contribute(c.id, 'bob', await agentEntropy('bob-seed'), { entropySource: 'agent-seed' });
        await mgr.finalize(c.id);

        const transcript = mgr.exportTranscript(c.id);
        const result = await mgr.verifyTranscript(transcript);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);

        // Tamper: swap a participant id in the transcript
        const parsed = JSON.parse(transcript);
        parsed.contributions[1].participantId = 'mallory';
        const tampered = await mgr.verifyTranscript(JSON.stringify(parsed));
        expect(tampered.valid).toBe(false);
        expect(tampered.errors.length).toBeGreaterThan(0);
    });

    test('turn timeout aborts the ceremony', async () => {
        const mgr = new CeremonyManager();
        const creator = makeParticipant('a', 'A');
        const c = await mgr.createCeremony('Timeout', creator, { turnTimeoutMs: 1 });
        mgr.openCeremony(c.id);
        mgr.joinQueue(c.id, makeParticipant('a', 'A'));
        mgr.startCeremony(c.id);
        await new Promise((r) => setTimeout(r, 10));
        await expect(mgr.contribute(c.id, 'a', randomEntropy(32))).rejects.toThrow('timed out');
        expect(mgr.getCeremony(c.id)!.phase).toBe('aborted');
    });

    test('remote snapshot: accepts valid, rejects tampered, keeps newer chain', async () => {
        const alice = new CeremonyManager();
        const c = await makeRunningCeremony(alice, ['alice', 'bob']);
        await alice.contribute(c.id, 'alice', randomEntropy(32));

        const snapshot: ZKCeremony = JSON.parse(JSON.stringify(alice.getCeremony(c.id)!));

        // A fresh peer accepts the snapshot
        const bob = new CeremonyManager();
        expect(await bob.applyRemoteSnapshot(snapshot)).toBe(true);

        // Tampered snapshot rejected
        const tampered: ZKCeremony = JSON.parse(JSON.stringify(snapshot));
        tampered.contributions[0].accumulatorHash = 'aa'.repeat(32);
        expect(await bob.applyRemoteSnapshot(tampered)).toBe(false);

        // Stale snapshot (fewer contributions) not applied over newer local state
        const fresh = new CeremonyManager();
        expect(await fresh.applyRemoteSnapshot(snapshot)).toBe(true);
        const stale = JSON.parse(JSON.stringify(snapshot));
        stale.contributions = [];
        stale.accumulatorHash = 'whatever';
        expect(await fresh.applyRemoteSnapshot(stale)).toBe(false);
    });

    test('mouse entropy collector gates on sample count and digests 32 bytes', async () => {
        const m = new MouseEntropyCollector(64);
        expect(m.ready).toBe(false);
        for (let i = 0; i < 64; i++) m.addSample(i * 3, i * 7);
        expect(m.ready).toBe(true);
        expect(m.progress).toBe(1);
        const entropy = await m.digest();
        expect(entropy.length).toBe(32);
        // Usable as ceremony entropy
        const mgr = new CeremonyManager();
        const c = await makeRunningCeremony(mgr, ['a']);
        const contribution = await mgr.contribute(c.id, 'a', entropy, { entropySource: 'mouse' });
        expect(contribution.entropySource).toBe('mouse');
    });

    test('agent entropy is deterministic per seed', async () => {
        const e1 = await agentEntropy('agent-42');
        const e2 = await agentEntropy('agent-42');
        const e3 = await agentEntropy('agent-43');
        expect(Buffer.from(e1).toString('hex')).toBe(Buffer.from(e2).toString('hex'));
        expect(Buffer.from(e1).toString('hex')).not.toBe(Buffer.from(e3).toString('hex'));
    });
});
