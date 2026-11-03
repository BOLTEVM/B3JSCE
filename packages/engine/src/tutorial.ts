/**
 * B3JS Engine — TutorialManager
 *
 * Guided, event-driven tutorials. Steps advance when the player performs
 * the real action (placing a gate, contributing entropy…) — detected via
 * the engine's DOM event bus, not simulated. Content is educational: each
 * step teaches the cryptographic concept behind the mechanic.
 *
 * The ZK Ceremony curriculum (ZK_CEREMONY_CURRICULUM) takes a player from
 * "what is a circuit" to running a full multi-party trusted setup with
 * agentic participants and verifying the transcript.
 */

export interface TutorialStep {
    id: string;
    title: string;
    /** What to do (imperative, short). */
    hint: string;
    /** The educational meat — what is happening and why. */
    body: string;
    /** The cryptographic concept this step teaches. */
    concept: string;
    /** DOM events that complete this step (first match advances). */
    completeEvents?: string[];
}

export const ZK_CEREMONY_CURRICULUM: TutorialStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to the Ceremony Arena',
        hint: 'Read on, then press Next.',
        body:
            'This world is a hands-on course in zero-knowledge cryptography. ' +
            'You will build a real arithmetic circuit out of physical gates, publish it, ' +
            'and then run a multi-party "trusted setup ceremony" — the same ritual that ' +
            'secures protocols like Zcash and Tornado Cash — together with AI agents.',
        concept:
            'A zero-knowledge proof lets you prove a statement is true without revealing WHY it is true. ' +
            'Games use this for hidden information with guaranteed honesty: sealed inventories, fog of war, sealed-bid auctions.',
    },
    {
        id: 'gates',
        title: 'Gates Are Computation',
        hint: 'Open the Ceremonies tab (bottom bar), Start Forge, and place any gate.',
        body:
            'On the forge platform you\'ll find a pre-built circuit. An arithmetic circuit is a graph of ' +
            'gates over a finite field — every operation is addition or multiplication modulo a huge prime ' +
            '(the BN254 field, ~254 bits). Place a gate of your own anywhere: it becomes an object in the world ' +
            'AND a node in the circuit graph.',
        concept:
            'Finite-field arithmetic is the native language of ZK proofs. There are no floats, no strings — ' +
            'only field elements. That is why the engine quantizes positions to a grid and hashes item names.',
        completeEvents: ['b3js:forge:gate'],
    },
    {
        id: 'wires',
        title: 'Wires Carry Signals',
        hint: 'In the forge panel, pick a "from" gate and click a target gate to wire them.',
        body:
            'Wires connect a gate\'s output signal to another gate\'s inputs. The pre-built circuit computes ' +
            'x² + 3 and asserts it equals 28: input x feeds a multiply gate (x·x), whose wire feeds an add gate ' +
            'with the constant 3, whose wire feeds an assert_eq gate against the constant 28.',
        concept:
            'A circuit is NOT a program that runs — it is a SET OF CONSTRAINTS. The prover must find values ' +
            '(a "witness") that satisfy every constraint simultaneously.',
        completeEvents: ['b3js:forge:wire'],
    },
    {
        id: 'witness',
        title: 'Evaluate the Witness',
        hint: 'Press Validate, then the circuit lights up when evaluated. Use the console: engine.circuitForge.evaluateLive({ x: 5n }) — or just click Validate.',
        body:
            'The secret here is x = 5, because 5² + 3 = 28. Evaluating the circuit with x = 5 produces a full ' +
            'witness: the value on every wire. Notice that multiply gates cost constraints (≈1 each) while ' +
            'additions are free — that asymmetry shapes how real circuits are designed.',
        concept:
            'The WITNESS is the complete assignment of wire values. Public inputs/outputs are visible to ' +
            'verifiers; private inputs (like x, marked 🔒) never leave the prover.',
        completeEvents: ['b3js:forge:evaluate'],
    },
    {
        id: 'publish',
        title: 'Publish the Blueprint',
        hint: 'In the forge panel, press "Publish Blueprint".',
        body:
            'Publishing freezes your circuit into a blueprint: a portable, content-hashed description. ' +
            'The SHA-256 blueprint hash is the circuit\'s identity — move gates around the world and the hash ' +
            'doesn\'t change, but alter one wire and it does. In multiplayer lobbies the blueprint is shared ' +
            'so everyone agrees on exactly which circuit the ceremony is for.',
        concept:
            'Content addressing binds a ceremony to ONE exact circuit. Nobody can swap the circuit ' +
            'mid-ceremony without changing the hash everyone committed to.',
        completeEvents: ['b3js:ceremony:blueprint'],
    },
    {
        id: 'ceremony',
        title: 'Create a Ceremony',
        hint: 'In the Ceremonies section, name your ceremony and press "Create Ceremony".',
        body:
            'Groth16 proofs (what this engine generates) need per-circuit parameters: a proving key and a ' +
            'verification key. Generating those keys requires secret randomness — "toxic waste" that must be ' +
            'destroyed, because anyone who keeps it can forge proofs. A ceremony splits that randomness ' +
            'across many participants so no single one can cheat.',
        concept:
            'TOXIC WASTE: the secret randomness used to generate SNARK parameters. If any adversary obtains ' +
            'all of it, they can create fake proofs. Ceremonies exist to make that practically impossible.',
        completeEvents: ['b3js:ceremony:phase'],
    },
    {
        id: 'agents',
        title: 'Invite an Agent',
        hint: 'In "Agentic Participants", name an agent and press "Spawn Agent". Then join the queue yourself and press Start on your ceremony.',
        body:
            'Ceremonies get stronger with more independent contributors. Spawn an agent — it will join ' +
            'ceremonies and contribute on its turns, just like a human. In a live lobby, agents are ' +
            'first-class SpacetimeDB clients: they call the same reducers, follow the same queue, and their ' +
            'contributions are equally verifiable.',
        concept:
            'Security model: 1-of-N honesty. As long as AT LEAST ONE participant (human or agent) destroys ' +
            'their entropy, the final parameters are safe. Diverse, independent contributors — including ' +
            'agents on different machines — make collusion implausible.',
        completeEvents: ['b3js:ceremony:agent'],
    },
    {
        id: 'entropy',
        title: 'Contribute Your Entropy',
        hint: 'When it\'s your turn (▶ by your name), use "Mouse Ritual" and wiggle — or press "Quick Contribute".',
        body:
            'On your turn you mix secret entropy into the shared accumulator: ' +
            'accᵢ = SHA256(accᵢ₋₁ ‖ SHA256(entropyᵢ)). Only the COMMITMENT (the hash of your entropy) is ' +
            'published — the entropy itself never leaves your machine. The mouse ritual gathers physical-world ' +
            'unpredictability and mixes it with your OS random number generator.',
        concept:
            'Commitments: SHA256(entropy) is published, entropy stays secret. You can later REVEAL the entropy ' +
            'to prove you contributed honestly (anyone can recompute the hash), but nobody can work backwards ' +
            'from the hash to your secret.',
        completeEvents: ['b3js:ceremony:contribution'],
    },
    {
        id: 'chain',
        title: 'Watch the Chain Grow',
        hint: 'Wait for other participants (your agent!) to contribute. Two or more links completes this step.',
        body:
            'Each contribution extends the hash chain: every link commits to the previous accumulator, the new ' +
            'entropy commitment, and the contributor\'s identity. The result is an append-only transcript that ' +
            'anyone can verify independently — order tampering, inserted links, or swapped contributors all ' +
            'break the chain.',
        concept:
            'This mirrors real ceremonies (Perpetual Powers of Tau, Zcash Sapling): a sequential chain where ' +
            'each participant verifies the previous contribution before adding their own.',
        completeEvents: ['b3js:ceremony:contribution'], // requires 2nd contribution — see shouldComplete
    },
    {
        id: 'finalize',
        title: 'Finalize the Ceremony',
        hint: 'When the queue completes, the creator presses "Finalize". Watch the vault door behind the altar.',
        body:
            'Finalization optionally mixes in a public BEACON — randomness nobody could have predicted ' +
            '(classically a future blockhash) — and seals the accumulator into the final parameters hash. ' +
            'The vault behind the altar is wired to this moment: when the ceremony finalizes, it opens and ' +
            'reveals the parameter artifact your lobby forged together.',
        concept:
            'A public beacon removes the last trust assumption (that the finalizer might bias the output). ' +
            'After finalization, the transcript + beacon fully determine the parameters.',
        completeEvents: ['b3js:ceremony:finalized'],
    },
    {
        id: 'verify',
        title: 'Verify the Transcript',
        hint: 'Press "Export Transcript" on your finalized ceremony (it logs to the console), or call B3_ZK.verifyTranscript(...) on it.',
        body:
            'The exported transcript is the ceremony\'s permanent public record: genesis hash, every ' +
            'contribution link, every attestation, the beacon, and the final parameters hash. ' +
            'verifyTranscript() recomputes the ENTIRE chain from scratch — this is what "trustless" means: ' +
            'don\'t trust the ceremony, audit it.',
        concept:
            'Public verifiability is the point. Anyone with the transcript can confirm: the queue order was ' +
            'respected, every link derives correctly, and the final hash follows from the contributions ' +
            'plus the beacon. No authority required.',
        completeEvents: ['b3js:ceremony:transcript', 'b3js:ceremony:verified'],
    },
    {
        id: 'done',
        title: '🎓 Ceremony Graduate',
        hint: 'You\'ve completed the curriculum. The arena is yours — remix it, host ceremonies, invite agents.',
        body:
            'You built a circuit, bound it to a blueprint hash, ran a multi-party trusted setup with an ' +
            'agentic contributor, and verified the transcript. Everything here composes with the rest of the ' +
            'engine: ZK zones, sealed inventories, fog of war, and the logic bricks on the altar ' +
            '(CeremonyTurnSensor → auto-contribute, CeremonyPhaseSensor → the vault door).',
        concept:
            'Next: export your circuit as Circom (forge panel), compile it with the real circom toolchain, ' +
            'and generate Groth16 proofs against the parameters your ceremony forged.',
    },
];

/**
 * The QuaiAxe curriculum (QUAIAXE_CURRICULUM) takes a player from "what is
 * mining" to running the full burn-mining loop: hash → shares → split →
 * burn $QAXE → spend the payout on the shared Furnace Wall.
 */
export const QUAIAXE_CURRICULUM: TutorialStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to the QuaiAxe Furnace',
        hint: 'Read on, then press Next.',
        body:
            'This world is a hands-on course in burn mining. You will run a QUAI miner, ' +
            'feed your earnings into the QuaiAxe furnace — where a share you choose is used ' +
            'to buy and BURN $QAXE — and spend the rest on pixels of the shared Furnace Wall.',
        concept:
            'Burn mining turns proof-of-work into deflation: instead of selling all your rewards, ' +
            'a slice is permanently destroyed (burned) in $QAXE, making every remaining token scarcer.',
    },
    {
        id: 'miner',
        title: 'Start the Miner',
        hint: 'Open the QuaiAxe tab (bottom bar) and press "Start Miner". Simulation mode is fine — it is clearly labeled.',
        body:
            'A miner repeatedly hashes block templates looking for one below the network target. ' +
            'Your hashrate (hashes per second) is your ticket rate: more hashes, more frequent shares. ' +
            'The panel shows instant, 1-minute and 15-minute average hashrate — miners watch the ' +
            'averages, because instant readings are noisy.',
        concept:
            'Proof-of-work is a lottery where tickets are hashes. Difficulty sets the odds; ' +
            'hashrate sets how often you draw. Expected earnings = hashrate ÷ difficulty × block reward.',
        completeEvents: ['b3js:qaxe:telemetry'],
    },
    {
        id: 'shares',
        title: 'Earn Your First Share',
        hint: 'Wait for a share to be accepted (watch the "Shares" counter), or keep mining.',
        body:
            'Pools coordinate thousands of miners by accepting SHARES: hashes that meet an easier ' +
            'pool target. Each accepted share is proof you did real work. Here, every accepted share ' +
            'adds an estimated 0.25 QUAI to your pending pot — estimates pace the game; the pool ' +
            'and the QuaiAxe contract are the authoritative ledger.',
        concept:
            'Shares solve the variance problem: solo miners wait weeks between blocks, pool miners ' +
            'get paid per share. Acceptance rate (accepted ÷ submitted) should stay near 100% — ' +
            'rejects mean stale work or hardware errors.',
        completeEvents: ['b3js:qaxe:share'],
    },
    {
        id: 'burnshare',
        title: 'Choose Your Burn Share',
        hint: 'Drag the "Burn share" slider and watch the split preview update live.',
        body:
            'The slider sets what percentage of each batch goes to buying and burning $QAXE — ' +
            'the contract enforces a 10% minimum. The preview shows the exact V2 split for your ' +
            'pending pot: 0.5% protocol fee first, then your payout and the burn budget, ' +
            'with a gas refund (≤3%) charged to the burn side.',
        concept:
            'The trade-off: higher burn share = smaller immediate payout, but more $QAXE destroyed, ' +
            'which supports the value of what remains. You are choosing between selling pressure ' +
            'and scarcity.',
        completeEvents: ['b3js:qaxe:config'],
    },
    {
        id: 'burn',
        title: 'Feed the Furnace',
        hint: 'Press "🔥 Feed the Furnace" — or step onto the glowing feed pad in the world.',
        body:
            'Feeding the furnace executes a burn batch over your pending pot. The math is exact ' +
            'integer arithmetic, the same as the contract: fee → payout → burn budget − gas. ' +
            'Watch the furnace flare with the burn — in a live lobby, every player\'s burns heat ' +
            'the SAME furnace, logged to a shared, verifiable burn table.',
        concept:
            'A burn is provable destruction: tokens sent to an unspendable address. Anyone can audit ' +
            'the total burned — scarcity claims do not require trusting anyone.',
        completeEvents: ['b3js:qaxe:burn'],
    },
    {
        id: 'wall',
        title: 'Paint the Furnace Wall',
        hint: 'Pick a color and click any pixel of the 32×32 wall in the panel (or walk up to the in-world wall).',
        body:
            'The Furnace Wall is a shared canvas paid for with burn proceeds: 10 QUAI for an empty ' +
            'pixel, 150 QUAI to overwrite someone else\'s. Overwrites cost 15× because they destroy ' +
            'another player\'s work — the price of territory on a commons.',
        concept:
            'This is a Harberger-style commons: scarce space, pay-to-modify, overwrite premium. ' +
            'On quaiaxe.com the same wall is global and paid in real burn payouts — here it syncs ' +
            'across your lobby via SpacetimeDB.',
        completeEvents: ['b3js:qaxe:paint'],
    },
    {
        id: 'done',
        title: '🔥 Furnace Graduate',
        hint: 'Course complete. Point a real miner at the middleware, or remix the world with logic bricks.',
        body:
            'You ran the full loop: hash → shares → split → burn → paint. Everything composes: ' +
            'QuaiAxeMiningSensor spins rigs while you hash, QuaiAxeBurnSensor pulses on every batch, ' +
            'QuaiAxeFeedActuator and QuaiAxePaintActuator let you wire the economy into any contraption. ' +
            'To mine for real, uncheck "simulate" and run the mining middleware (ws://localhost:8001).',
        concept:
            'Next: connect real hardware telemetry, join a live lobby so the wall and furnace are ' +
            'shared, and compare your acceptance rate against other miners.',
    },
];

export class TutorialManager {
    public steps: TutorialStep[] = ZK_CEREMONY_CURRICULUM;
    public currentIndex = 0;
    public active = false;
    /** Set when the arena template starts the tutorial. */
    public tutorialId: string = 'zk-ceremony';

    private handler: ((e: Event) => void) | null = null;

    private static storageKey(id: string): string {
        return `b3js_tutorial_${id.replace(/-/g, '_')}`;
    }

    /** True if the player already finished (or dismissed) this tutorial. */
    static hasCompleted(id: string = 'zk-ceremony'): boolean {
        try { return localStorage.getItem(TutorialManager.storageKey(id)) === 'done'; } catch { return false; }
    }

    /** Switch to a different curriculum (e.g. the QuaiAxe furnace course). */
    setCurriculum(id: string, steps: TutorialStep[]): void {
        this.tutorialId = id;
        this.steps = steps;
        this.currentIndex = 0;
    }

    /** Switch curriculum and start it in one call. */
    startCurriculum(id: string, steps: TutorialStep[], fromBeginning: boolean = true): void {
        this.setCurriculum(id, steps);
        this.start(fromBeginning);
    }

    get current(): TutorialStep {
        return this.steps[Math.min(this.currentIndex, this.steps.length - 1)];
    }

    get progress(): { index: number; total: number } {
        return { index: this.currentIndex, total: this.steps.length };
    }

    start(fromBeginning: boolean = true): void {
        if (fromBeginning) this.currentIndex = 0;
        this.active = true;
        this.bind();
        this.emit();
    }

    stop(markComplete: boolean = false): void {
        this.active = false;
        if (markComplete) {
            try { localStorage.setItem(TutorialManager.storageKey(this.tutorialId), 'done'); } catch { /* private mode */ }
        }
        this.unbind();
        this.emit();
    }

    next(): void {
        if (this.currentIndex < this.steps.length - 1) {
            this.currentIndex++;
            this.emit();
        } else {
            this.stop(true);
        }
    }

    prev(): void {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.emit();
        }
    }

    /**
     * Feed an engine event into the tutorial. If it matches the current
     * step's completion events (and any extra condition), advance.
     */
    notify(eventType: string): void {
        if (!this.active) return;
        const step = this.current;
        if (!step.completeEvents?.includes(eventType)) return;

        // The 'chain' step requires a SECOND contribution — the first one
        // completes the 'entropy' step. Guard via contribution count events.
        if (step.id === 'chain' && eventType === 'b3js:ceremony:contribution') {
            const detail = (this._lastEventDetail as any);
            if (!detail || typeof detail.contribution?.index !== 'number' || detail.contribution.index < 1) {
                return; // first contribution belongs to the entropy step
            }
        }

        // Small delay so the triggering UI state settles before the step flips
        setTimeout(() => this.next(), 600);
    }

    private _lastEventDetail: any = null;

    private bind(): void {
        if (typeof window === 'undefined' || this.handler) return;
        const watched = new Set<string>();
        for (const s of this.steps) s.completeEvents?.forEach((e) => watched.add(e));
        this.handler = (e: Event) => {
            this._lastEventDetail = (e as CustomEvent).detail;
            this.notify(e.type);
        };
        watched.forEach((evt) => window.addEventListener(evt, this.handler!));
    }

    private unbind(): void {
        if (typeof window === 'undefined' || !this.handler) return;
        const watched = new Set<string>();
        for (const s of this.steps) s.completeEvents?.forEach((e) => watched.add(e));
        watched.forEach((evt) => window.removeEventListener(evt, this.handler!));
        this.handler = null;
    }

    private emit(): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('b3js:tutorial:step', {
                detail: { index: this.currentIndex, step: this.current, active: this.active },
            }));
        }
    }
}
