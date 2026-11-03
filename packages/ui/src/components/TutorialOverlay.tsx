/**
 * TutorialOverlay — Guided tutorial UI for the Ceremony Arena.
 *
 * Renders the current step of the ZK ceremony curriculum as a side panel:
 * what to do (hint), what's happening (body), and the cryptographic
 * concept being taught. Steps advance automatically when the player
 * performs the real action in the world.
 */

import * as webjsx from 'webjsx';

export const TutorialOverlay = ({ engine, onRender }: any) => {
    const tutorial = engine?.tutorial;
    if (!tutorial || !tutorial.active) return null;

    const step = tutorial.current;
    const { index, total } = tutorial.progress;
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const waitsForAction = !!step.completeEvents;

    return (
        <div style="position: absolute; top: 60px; right: 16px; width: 330px; background: rgba(16, 10, 30, 0.96); border: 1px solid #b366ff; border-radius: 10px; padding: 14px; color: #ddd; font-family: sans-serif; z-index: 50; box-shadow: 0 4px 30px rgba(179, 102, 255, 0.25);">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 11px; font-weight: bold; color: #b366ff; text-transform: uppercase; letter-spacing: 1px;">
                    🎓 Ceremony Course
                </div>
                <div style="font-size: 10px; color: #888;">
                    {index + 1} / {total}
                </div>
            </div>

            {/* Progress bar */}
            <div style="height: 4px; background: #2a2a3a; border-radius: 2px; margin-bottom: 12px; overflow: hidden;">
                <div style={`height: 100%; width: ${((index + 1) / total) * 100}%; background: linear-gradient(90deg, #b366ff, #00ff88); border-radius: 2px; transition: width 0.4s;`} />
            </div>

            {/* Step title */}
            <div style="font-size: 15px; font-weight: bold; color: #fff; margin-bottom: 8px;">
                {step.title}
            </div>

            {/* Hint — the actionable instruction */}
            <div style="background: rgba(179, 102, 255, 0.12); border-left: 3px solid #b366ff; padding: 6px 10px; font-size: 11px; border-radius: 0 6px 6px 0; margin-bottom: 10px;">
                <b style="color: #b366ff;">Do this:</b> {step.hint}
            </div>

            {/* Body — what's happening */}
            <div style="font-size: 11px; line-height: 1.55; color: #ccc; margin-bottom: 10px;">
                {step.body}
            </div>

            {/* Concept box — the cryptography */}
            <div style="background: rgba(0, 255, 136, 0.07); border-left: 3px solid #00ff88; padding: 6px 10px; font-size: 10.5px; line-height: 1.5; color: #b8e8cc; border-radius: 0 6px 6px 0; margin-bottom: 12px;">
                <b style="color: #00ff88;">🧠 Concept:</b> {step.concept}
            </div>

            {/* Footer */}
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; gap: 6px;">
                    <button
                        style={`background: #2a2a3a; color: ${isFirst ? '#555' : '#ddd'}; border: 1px solid #444; border-radius: 4px; padding: 4px 10px; font-size: 10px; cursor: ${isFirst ? 'default' : 'pointer'};`}
                        disabled={isFirst}
                        onClick={() => { tutorial.prev(); onRender(); }}
                    >← Back</button>
                    {!waitsForAction && (
                        <button
                            style="background: #b366ff; color: #000; border: none; border-radius: 4px; padding: 4px 12px; font-size: 10px; font-weight: bold; cursor: pointer;"
                            onClick={() => { tutorial.next(); onRender(); }}
                        >{isLast ? 'Finish 🎉' : 'Next →'}</button>
                    )}
                    {waitsForAction && (
                        <button
                            title="Skip this step"
                            style="background: transparent; color: #666; border: 1px dashed #444; border-radius: 4px; padding: 4px 8px; font-size: 9px; cursor: pointer;"
                            onClick={() => { tutorial.next(); onRender(); }}
                        >skip</button>
                    )}
                </div>
                <button
                    style="background: transparent; color: #666; border: none; font-size: 9px; cursor: pointer; text-decoration: underline;"
                    onClick={() => { tutorial.stop(true); onRender(); }}
                >dismiss course</button>
            </div>

            {waitsForAction && (
                <div style="margin-top: 8px; font-size: 9px; color: #b366ff; text-align: center;">
                    ⏳ Waiting for you to do it in the world…
                </div>
            )}
        </div>
    );
};
