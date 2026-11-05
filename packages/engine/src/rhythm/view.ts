/**
 * @b3js/engine — ArcadeView
 *
 * A view is anything that can draw a RenderState. The 2D CanvasRenderer is
 * one; the WebXR stage (rhythm/xr) is another. The arcade keeps a list and
 * draws all of them every frame, so a run can be mirrored on a flat screen
 * and inside a headset at the same time.
 */
import type { RenderState } from './renderer';

export interface ArcadeView {
    render(state: RenderState): void;
    dispose(): void;
}
