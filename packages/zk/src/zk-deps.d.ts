/**
 * Ambient type declarations for ZK dependencies that don't ship their own types.
 */

// ─── circomlibjs ─────────────────────────────────────────────────

declare module 'circomlibjs' {
    export interface PoseidonHasher {
        (inputs: bigint[]): Uint8Array;
        F: {
            toObject(hash: Uint8Array): bigint;
            toString(hash: Uint8Array, radix?: number): string;
        };
    }

    export function buildPoseidon(): Promise<PoseidonHasher>;
    export function buildEddsa(): Promise<any>;
    export function buildBabyjub(): Promise<any>;
}

// ─── snarkjs ─────────────────────────────────────────────────────

declare module 'snarkjs' {
    export namespace groth16 {
        function fullProve(
            input: Record<string, any>,
            wasmFile: string | Uint8Array,
            zkeyFile: string | Uint8Array,
        ): Promise<{ proof: any; publicSignals: string[] }>;

        function verify(
            vkey: any,
            publicSignals: string[],
            proof: any,
        ): Promise<boolean>;
    }

    export namespace zKey {
        function exportVerificationKey(
            zkeyData: Uint8Array | string,
        ): Promise<any>;
    }

    export namespace wtns {
        function calculate(
            input: Record<string, any>,
            wasmFile: string | Uint8Array,
            wtnsFile: string | Uint8Array,
        ): Promise<void>;
    }
}

// ─── ffjavascript ────────────────────────────────────────────────

declare module 'ffjavascript' {
    export class Scalar {
        static fromString(s: string, radix?: number): bigint;
        static toString(n: bigint, radix?: number): string;
        static e(n: any): bigint;
    }

    export function buildBn128(): Promise<any>;
}
