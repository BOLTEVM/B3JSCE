/**
 * RhythmArcadePanel — launcher, progression and settings for the DeFi
 * rhythm mini-games (engine.rhythm).
 *
 * The game itself renders on a canvas over the viewport; this panel is the
 * "cabinet front": pick a game + difficulty, see bests, daily quests,
 * streak, XP, calibrate input latency, toggle sound/haptics.
 */

import * as webjsx from 'webjsx';
import type { ArcadeSnapshot, MiniGameMeta, Difficulty } from '@b3js/engine';

const RED = '#ff3333';
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

function panelState(engine: any) {
    if (!engine._rhythmPanel) {
        engine._rhythmPanel = { difficulty: 'normal' as Difficulty, selected: 'burn-beat', bound: false, calib: 0 };
    }
    return engine._rhythmPanel;
}

export const RhythmArcadePanel = ({ engine, onRender }: any) => {
    const arcade = engine?.rhythm;
    if (!arcade) return <div style="padding: 15px; color: #ff3366;">Rhythm Arcade not initialized.</div>;
    const state = panelState(engine);

    if (!state.bound && typeof window !== 'undefined') {
        state.bound = true;
        let last = 0;
        const rerender = () => { const n = Date.now(); if (n - last < 250) return; last = n; onRender(); };
        for (const evt of ['start', 'end', 'phase', 'fever']) window.addEventListener(`b3js:rhythm:${evt}`, rerender);
        state.calib = arcade.conductor.calibrationOffsetMs;
    }

    const snap: ArcadeSnapshot = arcade.getSnapshot();
    const p = snap.progress;
    const xpNext = arcade.progress.xpToNext();
    const viewport = engine?.renderer?.domElement?.parentElement ?? null;

    const title = (t: string) => <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">{t}</div>;
    const btn = (label: string, onClick: () => void, color = RED, disabled = false) => (
        <button style={`background: ${disabled ? '#333' : color}; color: ${disabled ? '#777' : '#000'}; border: none; border-radius: 4px; padding: 5px 10px; font-size: 10px; cursor: ${disabled ? 'default' : 'pointer'}; font-weight: bold;`} disabled={disabled} onClick={onClick}>{label}</button>
    );

    const play = (id: string) => {
        state.selected = id;
        void arcade.start(id, { difficulty: state.difficulty, container: viewport }).then(() => onRender());
    };

    const gameCard = (g: MiniGameMeta) => {
        const best = arcade.progress.best(g.id, state.difficulty);
        const life = BigInt(p.lifetimeQuai[g.id] ?? '0');
        const lifeStr = `${life < 0n ? '-' : '+'}${(Number(life < 0n ? -life : life) / 1e18).toFixed(2)}`;
        const active = snap.gameId === g.id && snap.phase !== 'idle';
        return (
            <div style={`border: 1px solid ${active ? g.color : '#2a2a2a'}; border-left: 4px solid ${g.color}; border-radius: 6px; padding: 8px 10px; background: #141414; display: flex; flex-direction: column; gap: 4px; min-width: 190px; flex: 1;`}>
                <div style={`color: ${g.color}; font-weight: bold; font-size: 12px;`}>{g.icon} {g.title}</div>
                <div style="color: #bbb; font-size: 10px;">{g.tagline}</div>
                <div style="color: #777; font-size: 9px; line-height: 1.3;">{g.lesson}</div>
                <div style="color: #999; font-size: 9px;">Lanes: {g.laneLabels.join(' · ')}{g.endless ? ' · ENDLESS' : ''}</div>
                <div style="display: flex; justify-content: space-between; font-size: 9px; color: #aaa; margin-top: 2px;">
                    <span>Best ({state.difficulty}): <b style="color: #fff;">{best ? `${best.score.toLocaleString()} ${best.grade}` : '—'}</b></span>
                    <span>Lifetime: <b style={`color: ${life >= 0n ? '#4ade80' : '#f87171'};`}>{lifeStr} QUAI</b></span>
                </div>
                <div style="margin-top: 4px;">{btn(active ? '▶ PLAYING' : '▶ PLAY', () => play(g.id), g.color, active)}</div>
            </div>
        );
    };

    return (
        <div style="padding: 10px 12px; color: #ddd; font-size: 11px; display: flex; flex-direction: column; gap: 10px; overflow: auto; height: 100%; box-sizing: border-box;">
            {/* Header row: progression */}
            <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: center; background: #0f0f0f; border: 1px solid #262626; border-radius: 6px; padding: 8px 12px;">
                <div><span style="color: #777;">LEVEL</span> <b style="color: #fff; font-size: 16px;">{p.level}</b></div>
                <div style="flex: 1; min-width: 120px;">
                    <div style="display: flex; justify-content: space-between; color: #777; font-size: 9px;"><span>XP</span><span>{p.xp} / {xpNext}</span></div>
                    <div style="height: 5px; background: #222; border-radius: 3px; overflow: hidden;"><div style={`height: 100%; width: ${Math.min(100, (p.xp / xpNext) * 100)}%; background: ${RED};`}></div></div>
                </div>
                <div><span style="color: #777;">STREAK</span> <b style="color: #fbbf24;">🔥 {p.streakDays}d</b></div>
                <div><span style="color: #777;">RUNS</span> <b>{p.totalRuns}</b></div>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <span style="color: #777;">DIFFICULTY</span>
                    {DIFFS.map(d => {
                        const unlocked = arcade.progress.isUnlocked(d);
                        const sel = state.difficulty === d;
                        return <button style={`background: ${sel ? RED : '#222'}; color: ${sel ? '#000' : unlocked ? '#ddd' : '#555'}; border: 1px solid #333; border-radius: 3px; padding: 3px 7px; font-size: 9px; cursor: pointer; text-transform: uppercase;`}
                            title={unlocked ? '' : `Unlocks at level ${arcade.unlockLevel(d)}`}
                            onClick={() => { if (unlocked) { state.difficulty = d; onRender(); } }}>{d}{unlocked ? '' : ' 🔒'}</button>;
                    })}
                </div>
            </div>

            {/* Status / controls when a game is active */}
            {snap.phase !== 'idle' && (
                <div style={`display: flex; gap: 10px; align-items: center; flex-wrap: wrap; border: 1px solid ${snap.meta?.color ?? RED}; border-radius: 6px; padding: 6px 10px; background: #111;`}>
                    <b style={`color: ${snap.meta?.color ?? RED};`}>{snap.meta?.icon} {snap.meta?.title}</b>
                    <span style="color: #999;">{snap.phase.toUpperCase()} · {snap.bpm} BPM · seed <code style="color: #aaa;">{snap.seed}</code></span>
                    {snap.score && <span>Score <b style="color: #fff;">{snap.score.score.toLocaleString()}</b> · Combo <b>{snap.score.combo}</b> ×{snap.score.multiplier} · {Math.round(snap.score.accuracy * 100)}% {snap.score.grade}{snap.score.feverActive ? ' · 🔥 FEVER' : ''}</span>}
                    <span style="flex: 1;"></span>
                    {snap.phase === 'playing' && btn('⏸ Pause (P)', () => { arcade.pause(); onRender(); }, '#999')}
                    {snap.phase === 'paused' && btn('▶ Resume', () => { arcade.resume(); onRender(); }, '#4ade80')}
                    {(snap.phase === 'results' || snap.phase === 'paused') && btn('↻ Again (R)', () => { arcade.restart(); onRender(); })}
                    {btn('✕ Exit (Esc)', () => { arcade.stop(); onRender(); }, '#555')}
                </div>
            )}

            {/* Results */}
            {snap.phase === 'results' && snap.results && (
                <div style="border: 1px solid #333; border-radius: 6px; padding: 8px 12px; background: #0f0f0f; display: flex; gap: 14px; flex-wrap: wrap; font-size: 10px;">
                    <div><b style="color: #fff; font-size: 14px;">{snap.results.finalScore.toLocaleString()}</b> <span style="color: #aaa;">{snap.results.summary.headline}</span>{snap.results.outcome.newBest && <b style="color: #fbbf24;"> ★ NEW BEST</b>}</div>
                    <div style="color: #4ade80;">+{snap.results.outcome.xpGained} XP{snap.results.outcome.leveledUp ? ` · LEVEL UP → ${snap.results.outcome.level}` : ''}</div>
                    {Object.entries(snap.results.summary.stats).map(([k, v]) => <div style="color: #999;">{k}: <b style="color: #ddd;">{v}</b></div>)}
                </div>
            )}

            {/* Game cards */}
            <div>
                {title('DeFi Rhythm Games · built for Quai Network')}
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">{snap.games.map(gameCard)}</div>
            </div>

            {/* Daily quests + settings */}
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 220px;">
                    {title(`Daily quests · ${p.questDay ?? ''}`)}
                    {p.quests.map(q => (
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 10px; margin-bottom: 4px;">
                            <span style={`color: ${q.done ? '#4ade80' : '#666'};`}>{q.done ? '✓' : '○'}</span>
                            <span style={`flex: 1; color: ${q.done ? '#888' : '#ddd'}; text-decoration: ${q.done ? 'line-through' : 'none'};`}>{q.text}</span>
                            <span style="color: #999;">{q.progress}/{q.target}</span>
                            <span style="color: #fbbf24;">+{q.xp} XP</span>
                        </div>
                    ))}
                </div>
                <div style="min-width: 240px;">
                    {title('Settings · cross-platform input')}
                    <div style="font-size: 10px; color: #aaa; line-height: 1.5;">
                        Keys <b style="color: #ddd;">D F J K</b> (or arrows) · touch the lane columns · gamepad d-pad / face buttons · XR via <code>RhythmLaneActuator</code>.
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
                        <span style="color: #777;">Latency offset</span>
                        <input type="range" min="-150" max="150" step="1" value={String(state.calib)} style="width: 110px;"
                            onInput={(e: any) => { state.calib = Number(e.target.value); arcade.setCalibrationOffset(state.calib); onRender(); }} />
                        <span style="color: #ddd; width: 46px;">{state.calib >= 0 ? '+' : ''}{state.calib} ms</span>
                        {btn('Auto-calibrate', () => { void arcade.startCalibration({ container: viewport }); onRender(); }, '#999', snap.phase !== 'idle')}
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 6px;">
                        {btn(snap.muted ? '🔇 Unmute' : '🔊 Mute', () => { arcade.setMuted(!snap.muted); onRender(); }, '#999')}
                        {btn(snap.hapticsEnabled ? '📳 Haptics on' : '📴 Haptics off', () => { arcade.hapticsEnabled = !arcade.hapticsEnabled; onRender(); }, '#999')}
                        {btn('🕹️ Load Arcade World', async () => { await engine.createRhythmArcadeTemplate(); onRender(); }, '#999', snap.phase !== 'idle')}
                    </div>
                </div>
            </div>

            {/* Recent runs */}
            {p.recent.length > 0 && (
                <div>
                    {title('Recent runs')}
                    <div style="display: flex; flex-direction: column; gap: 2px; font-size: 10px;">
                        {p.recent.slice(0, 6).map(r => {
                            const g = snap.games.find(x => x.id === r.gameId);
                            return <div style="display: flex; gap: 10px; color: #aaa;">
                                <span style={`color: ${g?.color ?? '#ddd'}; width: 120px;`}>{g?.icon} {g?.title ?? r.gameId}</span>
                                <span style="width: 56px; text-transform: uppercase;">{r.difficulty}</span>
                                <span style="width: 70px; color: #fff; text-align: right;">{r.score.toLocaleString()}</span>
                                <span style="width: 20px;">{r.grade}</span>
                                <span style="width: 40px;">{Math.round(r.accuracy * 100)}%</span>
                                <span style="flex: 1; color: #777;">{r.headline}</span>
                            </div>;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RhythmArcadePanel;
