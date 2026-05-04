/*
 * inventory_proof.circom — Private Inventory Verification Circuit
 *
 * Proves: "I own at least `minQuantity` of item `itemId`"
 * WITHOUT revealing the full inventory contents.
 *
 * Inputs:
 *   PRIVATE: inventory[MAX_SLOTS * 2] (flattened [itemId, qty] pairs), inventorySalt
 *   PUBLIC:  inventoryHash, itemId, minQuantity
 *
 * Constraints (~20k for 32 slots):
 *   1. Poseidon(inventory, inventorySalt) === inventoryHash
 *   2. sum(inventory[i].qty where inventory[i].itemId == itemId) >= minQuantity
 *
 * Compile:
 *   circom inventory_proof.circom --r1cs --wasm --sym -o build/
 *
 * Trusted Setup:
 *   snarkjs powersoftau new bn128 16 pot16_0000.ptau -v
 *   snarkjs powersoftau contribute pot16_0000.ptau pot16_final.ptau --name="B3JS Dev Ceremony"
 *   snarkjs powersoftau prepare phase2 pot16_final.ptau pot16_final_prepared.ptau -v
 *   snarkjs groth16 setup inventory_proof.r1cs pot16_final_prepared.ptau inventory_proof_0000.zkey
 *   snarkjs zkey contribute inventory_proof_0000.zkey inventory_proof_final.zkey --name="B3JS Phase 2"
 *   snarkjs zkey export verificationkey inventory_proof_final.zkey inventory_proof_vkey.json
 */

pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template InventoryProof(MAX_SLOTS) {
    // ─── Signals ─────────────────────────────────────────────

    // Private: The player's full inventory state (flattened [itemId, qty] pairs)
    signal input inventory[MAX_SLOTS * 2];
    signal input inventorySalt;

    // Public: What we're proving against
    signal input inventoryHash;  // Poseidon hash of (inventory, salt)
    signal input itemId;         // The item type we're proving ownership of
    signal input minQuantity;    // Minimum quantity we claim to own

    // ─── Step 1: Verify inventory hash ───────────────────────

    // Hash all inventory slots + salt with Poseidon
    // Poseidon supports up to ~16 inputs natively; for larger inputs
    // we chain multiple Poseidon calls
    component hashChain[MAX_SLOTS / 8 + 1];
    signal intermediateHashes[MAX_SLOTS / 8 + 1];

    // For simplicity with MAX_SLOTS = 32 (64 elements + 1 salt = 65 inputs),
    // we use a Merkle-style chained hash approach:
    // hash0 = Poseidon(inventory[0..15])
    // hash1 = Poseidon(inventory[16..31], hash0)
    // ... etc
    // finalHash = Poseidon(lastChainHash, inventorySalt)

    // Simplified: hash pairs of 16 elements at a time
    component mainHash = Poseidon(5);  // Hash of intermediate results + salt
    component slotHashes[4];  // 4 groups of 16 elements = 64 inventory slots
    
    for (var g = 0; g < 4; g++) {
        slotHashes[g] = Poseidon(16);
        for (var i = 0; i < 16; i++) {
            slotHashes[g].inputs[i] <== inventory[g * 16 + i];
        }
    }

    mainHash.inputs[0] <== slotHashes[0].out;
    mainHash.inputs[1] <== slotHashes[1].out;
    mainHash.inputs[2] <== slotHashes[2].out;
    mainHash.inputs[3] <== slotHashes[3].out;
    mainHash.inputs[4] <== inventorySalt;

    // Constraint: computed hash must match the public inventoryHash
    mainHash.out === inventoryHash;

    // ─── Step 2: Count matching items ────────────────────────

    // For each slot, check if itemId matches and accumulate quantity
    component isMatch[MAX_SLOTS];
    signal matchQty[MAX_SLOTS];
    signal runningTotal[MAX_SLOTS + 1];

    runningTotal[0] <== 0;

    for (var i = 0; i < MAX_SLOTS; i++) {
        // Check if inventory[i*2] (itemId) matches the target itemId
        isMatch[i] = IsEqual();
        isMatch[i].in[0] <== inventory[i * 2];      // slot itemId
        isMatch[i].in[1] <== itemId;                  // target itemId

        // If match, add quantity; otherwise add 0
        matchQty[i] <== isMatch[i].out * inventory[i * 2 + 1];  // qty if matched

        // Accumulate
        runningTotal[i + 1] <== runningTotal[i] + matchQty[i];
    }

    // ─── Step 3: Verify minimum quantity ─────────────────────

    // totalOwned >= minQuantity
    component gte = GreaterEqThan(64);  // 64-bit comparison
    gte.in[0] <== runningTotal[MAX_SLOTS];
    gte.in[1] <== minQuantity;
    gte.out === 1;
}

// Instantiate with 32 inventory slots (64 field elements for items)
component main {public [inventoryHash, itemId, minQuantity]} = InventoryProof(32);
