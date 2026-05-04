/*
 * position_proof.circom — Fog of War Position Circuit
 *
 * Proves: "I know valid (x, y, z) coordinates that hash to the
 *          published commitment, and the position is within world bounds."
 *
 * Used for fog-of-war mechanics where players hide their positions
 * but need to prove they are within the game world.
 *
 * Inputs:
 *   PRIVATE: x, y, z, salt
 *   PUBLIC:  positionHash, boundsMin, boundsMax
 *
 * Constraints (~5k):
 *   1. Poseidon(x, y, z, salt) === positionHash
 *   2. boundsMin <= x <= boundsMax
 *   3. boundsMin <= y <= boundsMax
 *   4. boundsMin <= z <= boundsMax
 *
 * Note: Coordinates are quantized to 10-unit grid cells before hashing.
 *       The circuit operates on grid indices, not raw world coordinates.
 *
 * Compile:
 *   circom position_proof.circom --r1cs --wasm --sym -o build/
 */

pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template PositionProof() {
    // ─── Signals ─────────────────────────────────────────────

    // Private: Grid-quantized position (x / gridSize, y / gridSize, z / gridSize)
    signal input x;
    signal input y;
    signal input z;
    signal input salt;

    // Public: Verification targets
    signal input positionHash;  // Poseidon(x, y, z, salt)
    signal input boundsMin;     // Minimum grid index (inclusive)
    signal input boundsMax;     // Maximum grid index (inclusive)

    // ─── Step 1: Verify position hash ────────────────────────

    component hasher = Poseidon(4);
    hasher.inputs[0] <== x;
    hasher.inputs[1] <== y;
    hasher.inputs[2] <== z;
    hasher.inputs[3] <== salt;

    hasher.out === positionHash;

    // ─── Step 2: Bounds checks ───────────────────────────────

    // x >= boundsMin
    component xMin = GreaterEqThan(32);
    xMin.in[0] <== x;
    xMin.in[1] <== boundsMin;
    xMin.out === 1;

    // x <= boundsMax
    component xMax = LessEqThan(32);
    xMax.in[0] <== x;
    xMax.in[1] <== boundsMax;
    xMax.out === 1;

    // y >= boundsMin
    component yMin = GreaterEqThan(32);
    yMin.in[0] <== y;
    yMin.in[1] <== boundsMin;
    yMin.out === 1;

    // y <= boundsMax
    component yMax = LessEqThan(32);
    yMax.in[0] <== y;
    yMax.in[1] <== boundsMax;
    yMax.out === 1;

    // z >= boundsMin
    component zMin = GreaterEqThan(32);
    zMin.in[0] <== z;
    zMin.in[1] <== boundsMin;
    zMin.out === 1;

    // z <= boundsMax
    component zMax = LessEqThan(32);
    zMax.in[0] <== z;
    zMax.in[1] <== boundsMax;
    zMax.out === 1;
}

component main {public [positionHash, boundsMin, boundsMax]} = PositionProof();
