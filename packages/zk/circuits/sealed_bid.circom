/*
 * sealed_bid.circom — Sealed Bid Auction Circuit
 *
 * Proves: "My bid amount hashes to the published commitment,
 *          and the bid is within the valid range [minBid, maxBid]."
 *
 * Used by the EconomyManager for privacy-preserving auctions
 * where bid amounts are hidden until the reveal phase.
 *
 * Inputs:
 *   PRIVATE: bidAmount, bidSalt
 *   PUBLIC:  bidHash, minBid, maxBid
 *
 * Constraints (~3k):
 *   1. Poseidon(bidAmount, bidSalt) === bidHash
 *   2. minBid <= bidAmount <= maxBid
 *
 * Compile:
 *   circom sealed_bid.circom --r1cs --wasm --sym -o build/
 */

pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template SealedBid() {
    // ─── Signals ─────────────────────────────────────────────

    // Private: The actual bid details
    signal input bidAmount;
    signal input bidSalt;

    // Public: Verification targets
    signal input bidHash;   // Poseidon(bidAmount, bidSalt)
    signal input minBid;    // Minimum valid bid for this auction
    signal input maxBid;    // Maximum valid bid for this auction

    // ─── Step 1: Verify bid hash ─────────────────────────────

    component hasher = Poseidon(2);
    hasher.inputs[0] <== bidAmount;
    hasher.inputs[1] <== bidSalt;

    // Constraint: hash must match
    hasher.out === bidHash;

    // ─── Step 2: Range check — minBid <= bidAmount ───────────

    component gteMin = GreaterEqThan(64);
    gteMin.in[0] <== bidAmount;
    gteMin.in[1] <== minBid;
    gteMin.out === 1;

    // ─── Step 3: Range check — bidAmount <= maxBid ───────────

    component lteMax = LessEqThan(64);
    lteMax.in[0] <== bidAmount;
    lteMax.in[1] <== maxBid;
    lteMax.out === 1;
}

component main {public [bidHash, minBid, maxBid]} = SealedBid();
