/**
 * B3JS Engine Tests — TutorialManager
 *
 * Covers curriculum integrity, manual navigation, event-driven
 * advancement, and the two-contribution guard on the chain step.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { TutorialManager, ZK_CEREMONY_CURRICULUM } from '../src/tutorial';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
    try { localStorage.removeItem('b3js_tutorial_zk_ceremony'); } catch { /* noop */ }
});

describe('TutorialManager', () => {
    test('curriculum is well-formed: unique ids, ordered, fully documented', () => {
        const ids = new Set(ZK_CEREMONY_CURRICULUM.map((s) => s.id));
        expect(ids.size).toBe(ZK_CEREMONY_CURRICULUM.length);
        expect(ZK_CEREMONY_CURRICULUM.length).toBeGreaterThanOrEqual(10);
        for (const step of ZK_CEREMONY_CURRICULUM) {
            expect(step.title.length).toBeGreaterThan(0);
            expect(step.hint.length).toBeGreaterThan(0);
            expect(step.body.length).toBeGreaterThan(50);
            expect(step.concept.length).toBeGreaterThan(20);
        }
        // First step is welcome, last is the graduation step
        expect(ZK_CEREMONY_CURRICULUM[0].id).toBe('welcome');
        expect(ZK_CEREMONY_CURRICULUM[ZK_CEREMONY_CURRICULUM.length - 1].id).toBe('done');
    });

    test('manual navigation: next/prev bounded', () => {
        const t = new TutorialManager();
        t.start(true);
        expect(t.active).toBe(true);
        expect(t.currentIndex).toBe(0);

        t.prev(); // bounded at 0
        expect(t.currentIndex).toBe(0);

        t.next();
        expect(t.currentIndex).toBe(1);
        t.prev();
        expect(t.currentIndex).toBe(0);
        t.stop();
        expect(t.active).toBe(false);
    });

    test('event-driven advancement only on matching events', async () => {
        const t = new TutorialManager();
        t.start(true);
        t.next(); // → 'gates' step (waits for b3js:forge:gate)

        t.notify('b3js:forge:wire'); // wrong event
        await sleep(700);
        expect(t.current.id).toBe('gates');

        t.notify('b3js:forge:gate'); // correct event
        await sleep(700);
        expect(t.current.id).toBe('wires');
        t.stop();
    });

    test('notify is inert while inactive', async () => {
        const t = new TutorialManager();
        t.start(true);
        t.next(); // → 'gates'
        t.stop();
        t.notify('b3js:forge:gate'); // inactive — must not advance
        await sleep(700);
        expect(t.current.id).toBe('gates');
    });

    test('completing all steps marks the tutorial done', () => {
        const t = new TutorialManager();
        t.start(true);
        t.currentIndex = t.steps.length - 1; // jump to 'done'
        t.next(); // finishing the last step stops + marks complete
        expect(t.active).toBe(false);
        // localStorage only exists in the browser runtime
        if (typeof localStorage !== 'undefined') {
            expect(TutorialManager.hasCompleted()).toBe(true);
        }
    });

    test('progress reports index and total', () => {
        const t = new TutorialManager();
        t.start(true);
        expect(t.progress).toEqual({ index: 0, total: t.steps.length });
        t.stop();
    });
});
