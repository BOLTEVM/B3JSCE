/*
 * move_proof.circom — Valid Movement Circuit
 *
 * Proves: "I moved from position A to position B, both positions
 *          are valid, and the distance is within my movement speed."
 *
 * Used alongside position_proof for fog-of-war worlds where
 * players must prove movements are legal without revealing positions.
 *
 * Inputs:
 *   PRIVATE: x1, y1, z1, salt1, x2, y2, z2, salt2
 *   PUBLIC:  oldHash, newHash, maxDistanceSquared
 *
 * Constraints (~12k):
 *   1. Poseidon(x1, y1, z1, salt1) === oldHash
 *   2. Poseidon(x2, y2, z2, salt2) === newHash
 *   3. (x2-x1)² + (y2-y1)² + (z2-z1)² <= maxDistanceSquared
 *
 * Note: Uses squared distance to avoid sqrt in-circuit.
 *       Grid indices (not raw world coords) are used.
 *
 * Compile:
 *   circom move_proof.circom --r1cs --wasm --sym -o build/
 */

pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template MoveProof() {
    // ─── Signals ─────────────────────────────────────────────

    // Private: Source position (grid-quantized)
    signal input x1;
    signal input y1;
    signal input z1;
    signal input salt1;

    // Private: Destination position (grid-quantized)
    signal input x2;
    signal input y2;
    signal input z2;
    signal input salt2;

    // Public: Verification targets
    signal input oldHash;            // Poseidon(x1, y1, z1, salt1)
    signal input newHash;            // Poseidon(x2, y2, z2, salt2)
    signal input maxDistanceSquared; // Maximum movement distance² (grid units²)

    // ─── Step 1: Verify source hash ──────────────────────────

    component hashOld = Poseidon(4);
    hashOld.inputs[0] <== x1;
    hashOld.inputs[1] <== y1;
    hashOld.inputs[2] <== z1;
    hashOld.inputs[3] <== salt1;

    hashOld.out === oldHash;

    // ─── Step 2: Verify destination hash ─────────────────────

    component hashNew = Poseidon(4);
    hashNew.inputs[0] <== x2;
    hashNew.inputs[1] <== y2;
    hashNew.inputs[2] <== z2;
    hashNew.inputs[3] <== salt2;

    hashNew.out === newHash;

    // ─── Step 3: Distance check ──────────────────────────────

    // Compute squared deltas (avoiding negative numbers in field arithmetic)
    // We use the identity: (a-b)² = a² - 2ab + b²
    signal dx;
    signal dy;
    signal dz;
    signal dx2;
    signal dy2;
    signal dz2;

    dx <== x2 - x1;
    dy <== y2 - y1;
    dz <== z2 - z1;

    dx2 <== dx * dx;
    dy2 <== dy * dy;
    dz2 <== dz * dz;

    signal distSquared;
    distSquared <== dx2 + dy2 + dz2;

    // distSquared <= maxDistanceSquared
    component distCheck = LessEqThan(64);
    distCheck.in[0] <== distSquared;
    distCheck.in[1] <== maxDistanceSquared;
    distCheck.out === 1;
}

component main {public [oldHash, newHash, maxDistanceSquared]} = MoveProof();
