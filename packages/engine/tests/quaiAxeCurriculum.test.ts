/**
 * B3JS Engine Tests — QuaiAxe Curriculum
 *
 * Covers the burn-mining tutorial: curriculum integrity, per-curriculum
 * completion keys, and event-driven advancement over the qaxe event bus.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { TutorialManager, QUAIAXE_CURRICULUM } from '../src/tutorial';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
    try { localStorage.removeItem('b3js_tutorial_quaiaxe'); } catch { /* noop */ }
});

describe('QuaiAxe curriculum', () => {
    test('curriculum is well-formed: unique ids, documented, event-gated', () => {
        const ids = new Set(QUAIAXE_CURRICULUM.map((s) => s.id));
        expect(ids.size).toBe(QUAIAXE_CURRICULUM.length);
        for (const step of QUAIAXE_CURRICULUM) {
            expect(step.title.length).toBeGreaterThan(0);
            expect(step.hint.length).toBeGreaterThan(0);
            expect(step.body.length).toBeGreaterThan(50);
            expect(step.concept.length).toBeGreaterThan(20);
        }
        expect(QUAIAXE_CURRICULUM[0].id).toBe('welcome');
        expect(QUAIAXE_CURRICULUM[QUAIAXE_CURRICULUM.length - 1].id).toBe('done');

        // Middle steps each wait on a distinct qaxe event
        const eventSteps = QUAIAXE_CURRICULUM.filter((s) => s.completeEvents?.length);
        expect(eventSteps.length).toBe(5); // miner, shares, burnshare, burn, wall
        const events = eventSteps.map((s) => s.completeEvents![0]);
        expect(new Set(events).size).toBe(events.length); // no two steps share an event
    });

    test('startCurriculum switches steps and tracks its own completion key', () => {
        const t = new TutorialManager();
        expect(t.tutorialId).toBe('zk-ceremony');
        t.startCurriculum('quaiaxe', QUAIAXE_CURRICULUM, true);
        expect(t.tutorialId).toBe('quaiaxe');
        expect(t.steps).toBe(QUAIAXE_CURRICULUM);
        expect(t.active).toBe(true);

        t.currentIndex = t.steps.length - 1;
        t.next(); // completes → marks done under the quaiaxe key only
        expect(t.active).toBe(false);
        if (typeof localStorage !== 'undefined') {
            expect(TutorialManager.hasCompleted('quaiaxe')).toBe(true);
            expect(TutorialManager.hasCompleted('zk-ceremony')).toBe(false);
        }
    });

    test('walks the full burn-mining loop via qaxe events', async () => {
        const t = new TutorialManager();
        t.startCurriculum('quaiaxe', QUAIAXE_CURRICULUM, true);

        t.next(); // → miner (waits for telemetry)
        expect(t.current.id).toBe('miner');
        t.notify('b3js:qaxe:share'); // wrong event for this step
        await sleep(700);
        expect(t.current.id).toBe('miner');

        t.notify('b3js:qaxe:telemetry');
        await sleep(700);
        expect(t.current.id).toBe('shares');

        t.notify('b3js:qaxe:share');
        await sleep(700);
        expect(t.current.id).toBe('burnshare');

        t.notify('b3js:qaxe:config');
        await sleep(700);
        expect(t.current.id).toBe('burn');

        t.notify('b3js:qaxe:burn');
        await sleep(700);
        expect(t.current.id).toBe('wall');

        t.notify('b3js:qaxe:paint');
        await sleep(700);
        expect(t.current.id).toBe('done');
        t.stop();
    });
});
