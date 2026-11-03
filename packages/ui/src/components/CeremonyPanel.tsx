/**
 * CeremonyPanel — ZK Ceremony coordination UI for the B3JS editor.
 *
 * Three surfaces in one panel:
 *   1. CIRCUIT FORGE — place gates, wire them, evaluate, publish blueprints
 *   2. CEREMONIES   — create/join/contribute/finalize trusted setups
 *   3. AGENTS       — spawn agentic participants that auto-contribute
 *
 * Contribution uses a mouse-entropy mini-game: wiggle to forge randomness,
 * then channel it into the ceremony accumulator.
 */

import * as webjsx from 'webjsx';
import { MouseEntropyCollector, randomEntropy } from '@b3js/zk';
import { ZK_CEREMONY_CURRICULUM } from '@b3js/engine';
import type { ZKCeremony, CircuitGateType } from '@b3js/zk';

const PHASE_COLORS: Record<string, string> = {
    draft: '#888',
    open: '#00d4ff',
    running: '#f6ad55',
    finalizing: '#b366ff',
    finalized: '#00ff88',
    aborted: '#ff3366',
};

const GATE_TYPES: Array<{ type: CircuitGateType; icon: string; hint: string }> = [
    { type: 'input', icon: '📥', hint: 'Public/private input signal' },
    { type: 'const', icon: '🔢', hint: 'Constant field element' },
    { type: 'add', icon: '➕', hint: 'Sum inputs (free)' },
    { type: 'mul', icon: '✖️', hint: 'Multiply inputs (1 constraint)' },
    { type: 'poseidon', icon: '🌀', hint: 'ZK-friendly hash' },
    { type: 'iszero', icon: '0️⃣', hint: 'Zero test' },
    { type: 'select', icon: '🔀', hint: 'cond ? a : b' },
    { type: 'assert_eq', icon: '⚖️', hint: 'Equality constraint' },
    { type: 'output', icon: '📤', hint: 'Public output' },
];

// Per-engine panel state (webjsx re-renders blow away closures)
function panelState(engine: any) {
    if (!(engine as any)._ceremonyPanel) {
        (engine as any)._ceremonyPanel = {
            selectedCeremonyId: '',
            collector: null as MouseEntropyCollector | null,
            agentName: 'Agent',
            agentSeed: Math.random().toString(36).slice(2, 10),
            ceremonyName: 'My Ceremony',
            forgeName: 'My Circuit',
            pendingWireFrom: '',
            gateLabel: '',
            constValue: '1',
            isPrivate: false,
            statusLine: '',
            bound: false,
        };
    }
    return (engine as any)._ceremonyPanel;
}

export const CeremonyPanel = ({ engine, onRender }: any) => {
    const coordinator = engine?.ceremony;
    if (!coordinator) {
        return <div style="padding: 15px; color: #ff3366;">CeremonyCoordinator not initialized.</div>;
    }
    const state = panelState(engine);

    // Bind ceremony events → re-render (once per engine)
    if (!state.bound && typeof window !== 'undefined') {
        state.bound = true;
        const rerender = () => onRender();
        for (const evt of ['sync', 'turn', 'contribution', 'phase', 'finalized', 'blueprint', 'participant_joined']) {
            window.addEventListener(`b3js:ceremony:${evt}`, rerender);
        }
    }

    const ceremonies: ZKCeremony[] = coordinator.manager.listCeremonies();
    const selected: ZKCeremony | undefined =
        ceremonies.find((c) => c.id === state.selectedCeremonyId) ?? ceremonies[0];
    const blueprints = Array.from(coordinator.blueprints.values());
    const forge = engine.circuitForge;
    const session = forge?.session;
    const me = coordinator.localIdentity();
    const online = coordinator.isOnline();

    const setStatus = (msg: string) => { state.statusLine = msg; onRender(); };

    // ─── Actions ────────────────────────────────────────────────

    const createCeremony = async () => {
        try {
            const bpId = state.forgeBlueprintId || undefined;
            const c = await coordinator.createCeremony(state.ceremonyName, bpId);
            state.selectedCeremonyId = c.id;
            setStatus(`Ceremony "${c.name}" created${online ? ' & published' : ' (offline)'}`);
        } catch (e: any) { setStatus(`Create failed: ${e.message}`); }
    };

    const joinQueue = (ceremonyId: string) => {
        try {
            coordinator.joinCeremony(ceremonyId, 'human');
            setStatus('Joined queue');
        } catch (e: any) { setStatus(`Join failed: ${e.message}`); }
    };

    const startCeremony = (ceremonyId: string) => {
        try {
            coordinator.startCeremony(ceremonyId);
            setStatus('Ceremony started — first contributor is up');
        } catch (e: any) { setStatus(`Start failed: ${e.message}`); }
    };

    const beginEntropyGame = () => {
        state.collector = new MouseEntropyCollector(128);
        onRender();
    };

    const contributeRandom = async (ceremonyId: string) => {
        try {
            await coordinator.contribute(ceremonyId, randomEntropy(48), { entropySource: 'random' });
            setStatus('Entropy contributed (CSPRNG)');
        } catch (e: any) { setStatus(`Contribute failed: ${e.message}`); }
    };

    const contributeMouse = async (ceremonyId: string) => {
        if (!state.collector?.ready) return;
        try {
            const entropy = await state.collector.digest();
            await coordinator.contribute(ceremonyId, entropy, { entropySource: 'mouse' });
            state.collector = null;
            setStatus('Mouse entropy forged into the chain 🔥');
        } catch (e: any) { setStatus(`Contribute failed: ${e.message}`); }
    };

    const finalize = async (ceremonyId: string) => {
        try {
            const hash = await coordinator.finalizeCeremony(ceremonyId, state.beacon || undefined);
            setStatus(`Finalized → ${hash.substring(0, 16)}…`);
        } catch (e: any) { setStatus(`Finalize failed: ${e.message}`); }
    };

    const spawnAgent = () => {
        import('@b3js/zk').then(({ ZKCeremonyAgent }) => {
            const agent = new ZKCeremonyAgent(
                `agent_${state.agentSeed}`,
                state.agentName,
                state.agentSeed,
            );
            coordinator.registerAgent(agent);
            setStatus(`Agent "${state.agentName}" registered — it will auto-contribute on its turns`);
            onRender();
        });
    };

    // ─── Render ─────────────────────────────────────────────────

    const sectionTitle = (text: string) => (
        <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">{text}</div>
    );

    const btn = (label: string, onClick: () => void, color = '#b366ff', disabled = false) => (
        <button
            style={`background: ${disabled ? '#333' : color}; color: ${disabled ? '#777' : '#000'}; border: none; border-radius: 4px; padding: 4px 10px; font-size: 10px; cursor: ${disabled ? 'default' : 'pointer'}; font-weight: bold;`}
            disabled={disabled}
            onClick={onClick}
        >{label}</button>
    );

    return (
        <div style="padding: 12px; background: #1a1a1a; height: 100%; color: #ddd; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <div style="font-size: 13px; font-weight: bold; color: #b366ff;">🔮 ZK Ceremonies</div>
                <div style="font-size: 9px; color: #888;">
                    {online ? '🟢 Multiplayer' : '⚪ Offline'} · {ceremonies.length} ceremonies · {blueprints.length} blueprints
                </div>
            </div>

            {/* Arena + tutorial entry */}
            <div style="display: flex; gap: 6px;">
                {btn('🏟️ Load Ceremony Arena (Tutorial)', async () => {
                    await engine.createCeremonyArenaTemplate();
                    onRender();
                }, '#6a3bd8')}
                {btn('🎓 Course', () => { engine.tutorial?.startCurriculum('zk-ceremony', ZK_CEREMONY_CURRICULUM, true); onRender(); }, '#444')}
            </div>

            {/* Status line */}
            {state.statusLine && (
                <div style="font-size: 10px; color: #f6ad55; background: #2a2216; padding: 4px 8px; border-radius: 4px;">
                    {state.statusLine}
                </div>
            )}

            {/* ── 1. Circuit Forge ── */}
            <div>
                {sectionTitle('⚡ Circuit Forge')}
                {!session ? (
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <input
                            style="flex: 1; background: #111; border: 1px solid #333; color: #ddd; border-radius: 4px; padding: 4px 6px; font-size: 10px;"
                            value={state.forgeName}
                            onInput={(e: any) => { state.forgeName = e.target.value; }}
                        />
                        {btn('Start Forge', () => { forge.startForge(state.forgeName); onRender(); })}
                    </div>
                ) : (
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="font-size: 10px; color: #888;">
                            Forging <b style="color: #b366ff">{session.builder.name}</b> — {session.builder.getGates().length} gates, {session.wires.length} wires
                        </div>
                        {/* Gate palette */}
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            {GATE_TYPES.map((g) => (
                                <button
                                    key={g.type}
                                    title={g.hint}
                                    style="background: #242424; border: 1px solid #444; color: #ddd; border-radius: 4px; padding: 3px 6px; font-size: 10px; cursor: pointer;"
                                    onClick={() => {
                                        // Place in front of the camera
                                        const cam = engine.camera;
                                        const pos = cam.position.clone();
                                        const dir = cam.position.clone();
                                        cam.getWorldDirection(dir);
                                        pos.addScaledVector(dir, 8);
                                        const gateId = forge.placeGate(g.type, { x: pos.x, y: pos.y, z: pos.z }, {
                                            label: state.gateLabel || undefined,
                                            constValue: g.type === 'const' ? state.constValue : undefined,
                                            isPrivate: g.type === 'input' ? state.isPrivate : undefined,
                                        });
                                        state.lastGateId = gateId;
                                        onRender();
                                    }}
                                >{g.icon} {g.type}</button>
                            ))}
                        </div>
                        {/* Gate options */}
                        <div style="display: flex; gap: 6px; align-items: center; font-size: 10px;">
                            <input placeholder="label" style="width: 80px; background: #111; border: 1px solid #333; color: #ddd; border-radius: 3px; padding: 2px 5px; font-size: 10px;"
                                value={state.gateLabel} onInput={(e: any) => { state.gateLabel = e.target.value; }} />
                            <input placeholder="const value" style="width: 60px; background: #111; border: 1px solid #333; color: #ddd; border-radius: 3px; padding: 2px 5px; font-size: 10px;"
                                value={state.constValue} onInput={(e: any) => { state.constValue = e.target.value; }} />
                            <label style="display: flex; gap: 3px; align-items: center; color: #888;">
                                <input type="checkbox" checked={state.isPrivate} onChange={(e: any) => { state.isPrivate = e.target.checked; onRender(); }} />
                                private
                            </label>
                        </div>
                        {/* Wiring */}
                        <div style="display: flex; gap: 6px; align-items: center; font-size: 10px;">
                            <span style="color: #888;">Wire:</span>
                            <select style="background: #111; color: #ddd; border: 1px solid #333; border-radius: 3px; font-size: 10px;"
                                value={state.pendingWireFrom}
                                onChange={(e: any) => { state.pendingWireFrom = e.target.value; onRender(); }}>
                                <option value="">from…</option>
                                {session.builder.getGates().map((g: any) => (
                                    <option value={g.id}>{g.label || g.type} ({g.id.slice(-4)})</option>
                                ))}
                            </select>
                            <span style="color: #888;">→ click target gate below</span>
                        </div>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            {session.builder.getGates().map((g: any) => (
                                <button
                                    key={g.id}
                                    style="background: #1f1f2a; border: 1px solid #444; color: #ccc; border-radius: 3px; padding: 2px 6px; font-size: 9px; cursor: pointer;"
                                    onClick={() => {
                                        if (state.pendingWireFrom && state.pendingWireFrom !== g.id) {
                                            try {
                                                forge.wireGates(state.pendingWireFrom, g.id);
                                                state.pendingWireFrom = '';
                                            } catch (e: any) { setStatus(e.message); }
                                        }
                                        onRender();
                                    }}
                                >{g.label || g.type}</button>
                            ))}
                        </div>
                        {/* Validate / publish */}
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            {btn('Validate', () => {
                                const problems = forge.validate();
                                setStatus(problems.length === 0 ? '✅ Circuit is valid' : `❌ ${problems[0]}`);
                            }, '#4488ff')}
                            {btn('▶ Evaluate', () => {
                                try {
                                    // Demo convenience: the Initiation Circuit's secret is x = 5
                                    const inputs: Record<string, string> = {};
                                    for (const g of session.builder.getGates()) {
                                        if (g.type === 'input' && g.label === 'x') inputs['x'] = '5';
                                    }
                                    const r = forge.evaluateLive(inputs);
                                    setStatus(r
                                        ? (r.satisfied
                                            ? `✅ Witness satisfies all constraints (${r.constraintCount} constraints) — outputs: ${r.outputs.join(', ')}`
                                            : `❌ ${r.failures[0]}`)
                                        : 'No active forge');
                                } catch (e: any) { setStatus(e.message); }
                            }, '#f6ad55')}
                            {btn('Publish Blueprint', async () => {
                                try {
                                    const bp = await forge.publish();
                                    setStatus(`Blueprint published (${session.builder.getGates().length} gates)`);
                                    state.forgeBlueprintId = bp.id;
                                } catch (e: any) { setStatus(e.message); }
                            }, '#00ff88')}
                            {btn('Export Circom', () => {
                                try {
                                    const src = session.builder.exportCircom();
                                    console.log(src);
                                    setStatus('Circom source logged to console');
                                } catch (e: any) { setStatus(e.message); }
                            }, '#888')}
                            {btn('Clear', () => { forge.clearForge(); onRender(); }, '#ff3366')}
                        </div>
                    </div>
                )}
            </div>

            {/* ── 2. Blueprints ── */}
            {blueprints.length > 0 && (
                <div>
                    {sectionTitle('📜 Published Blueprints')}
                    {blueprints.map((bp: any) => (
                        <div key={bp.id} style="display: flex; justify-content: space-between; align-items: center; background: #202020; border-radius: 4px; padding: 5px 8px; margin-bottom: 4px; font-size: 10px;">
                            <span>{bp.name} <span style="color: #666;">({bp.gates.length} gates)</span></span>
                            <div style="display: flex; gap: 4px;">
                                {btn('Load', () => { forge.loadBlueprint(bp); onRender(); }, '#4488ff')}
                                {btn('Ceremony', () => { state.forgeBlueprintId = bp.id; onRender(); }, '#b366ff')}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── 3. Ceremonies ── */}
            <div>
                {sectionTitle('🕯️ Ceremonies')}
                <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                    <input
                        style="flex: 1; background: #111; border: 1px solid #333; color: #ddd; border-radius: 4px; padding: 4px 6px; font-size: 10px;"
                        value={state.ceremonyName}
                        onInput={(e: any) => { state.ceremonyName = e.target.value; }}
                    />
                    {btn('Create Ceremony', createCeremony)}
                </div>

                {ceremonies.length === 0 && (
                    <div style="font-size: 10px; color: #666;">No ceremonies yet. Forge a circuit, publish it, then create a ceremony to generate its trusted parameters with the lobby.</div>
                )}

                {ceremonies.map((c) => {
                    const isSelected = selected?.id === c.id;
                    const isCreator = c.creatorId === me;
                    const myTurn = coordinator.manager.getCurrentTurn(c.id)?.id === me;
                    return (
                        <div key={c.id}
                            style={`background: ${isSelected ? '#252535' : '#202020'}; border: 1px solid ${isSelected ? '#b366ff' : '#333'}; border-radius: 6px; padding: 8px; margin-bottom: 6px; cursor: pointer;`}
                            onClick={() => { state.selectedCeremonyId = c.id; onRender(); }}>
                            <div style="display: flex; justify-content: space-between; font-size: 11px;">
                                <b>{c.name}</b>
                                <span style={`color: ${PHASE_COLORS[c.phase]}; font-weight: bold;`}>{c.phase.toUpperCase()}</span>
                            </div>
                            <div style="font-size: 9px; color: #888; margin-top: 3px;">
                                {c.contributions.length}/{c.participants.length} contributions
                                {c.blueprintHash && ` · circuit ${c.blueprintHash.substring(0, 8)}…`}
                            </div>

                            {isSelected && (
                                <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;" onClick={(e: any) => e.stopPropagation()}>
                                    {/* Queue */}
                                    <div style="font-size: 9px;">
                                        {c.participants.map((p, i) => {
                                            const done = i < c.contributions.length;
                                            const isTurn = c.phase === 'running' && i === c.contributions.length;
                                            return (
                                                <div key={p.id} style={`color: ${done ? '#00ff88' : isTurn ? '#f6ad55' : '#888'};`}>
                                                    {done ? '✓' : isTurn ? '▶' : '○'} {p.displayName}
                                                    {p.kind === 'agent' ? ' 🤖' : ''}
                                                    {p.id === me ? ' (you)' : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Actions */}
                                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                        {c.phase === 'open' && btn('Join Queue', () => joinQueue(c.id), '#00d4ff')}
                                        {c.phase === 'open' && isCreator && btn('Start', () => startCeremony(c.id), '#f6ad55', c.participants.length === 0)}
                                        {myTurn && btn('⚡ Quick Contribute', () => contributeRandom(c.id), '#00ff88')}
                                        {myTurn && btn('🖱️ Mouse Ritual', beginEntropyGame, '#b366ff')}
                                        {c.phase === 'finalizing' && isCreator && btn('Finalize', () => finalize(c.id), '#00ff88')}
                                        {(c.phase === 'open' || c.phase === 'running') && isCreator && btn('Abort', () => coordinator.abortCeremony(c.id), '#ff3366')}
                                        {c.phase === 'finalized' && btn('Export Transcript', () => {
                                            const t = coordinator.manager.exportTranscript(c.id);
                                            console.log(t);
                                            window.dispatchEvent(new CustomEvent('b3js:ceremony:transcript', { detail: { ceremonyId: c.id } }));
                                            setStatus('Transcript logged to console — anyone can verify it');
                                        }, '#4488ff')}
                                    </div>
                                    {/* Final hash */}
                                    {c.finalParametersHash && (
                                        <div style="font-size: 9px; color: #00ff88; word-break: break-all;">
                                            🔑 params: {c.finalParametersHash}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Mouse entropy mini-game */}
                {state.collector && selected && (
                    <div style="border: 1px dashed #b366ff; border-radius: 6px; padding: 8px; text-align: center;">
                        <div style="font-size: 10px; color: #b366ff; margin-bottom: 4px;">
                            🖱️ Wiggle your mouse to forge entropy — {(state.collector.progress * 100).toFixed(0)}%
                        </div>
                        <div
                            style="height: 60px; background: radial-gradient(circle, #2a1a3a, #111); border-radius: 4px; cursor: crosshair; margin-bottom: 6px;"
                            onMouseMove={(e: any) => {
                                const rect = e.target.getBoundingClientRect();
                                state.collector.addSample(e.clientX - rect.left, e.clientY - rect.top);
                                if (state.collector.samples % 16 === 0) onRender();
                            }}
                        />
                        {btn('Channel Entropy Into the Chain', () => contributeMouse(selected.id), '#b366ff', !state.collector.ready)}
                    </div>
                )}
            </div>

            {/* ── 4. Agents ── */}
            <div>
                {sectionTitle('🤖 Agentic Participants')}
                <div style="display: flex; gap: 6px; align-items: center;">
                    <input placeholder="agent name" style="width: 90px; background: #111; border: 1px solid #333; color: #ddd; border-radius: 3px; padding: 3px 5px; font-size: 10px;"
                        value={state.agentName} onInput={(e: any) => { state.agentName = e.target.value; }} />
                    <input placeholder="seed" style="width: 80px; background: #111; border: 1px solid #333; color: #ddd; border-radius: 3px; padding: 3px 5px; font-size: 10px;"
                        value={state.agentSeed} onInput={(e: any) => { state.agentSeed = e.target.value; }} />
                    {btn('Spawn Agent', spawnAgent)}
                </div>
                {coordinator.agents.map((a: any) => (
                    <div key={a.participant.id} style="font-size: 9px; color: #888; margin-top: 4px;">
                        🤖 {a.participant.displayName} — {a.contributionHistory.length} contributions
                        {a.autoContribute ? ' · auto' : ' · manual'}
                    </div>
                ))}
            </div>
        </div>
    );
};
