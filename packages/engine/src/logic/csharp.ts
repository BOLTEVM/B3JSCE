import { Controller, B3ObjectRef, B3EngineRef } from './base';
import type { NodeInfo } from './graph';

// ─── C# Compilation Mode ──────────────────────────────────────
// Toggled via the Settings panel. Persisted to localStorage.
export type CSharpCompileMode = 'client' | 'server';

export function getCSharpCompileMode(): CSharpCompileMode {
    return (localStorage.getItem('B3JS_CSHARP_COMPILE_MODE') as CSharpCompileMode) || 'client';
}

export function setCSharpCompileMode(mode: CSharpCompileMode) {
    localStorage.setItem('B3JS_CSHARP_COMPILE_MODE', mode);
    console.log(`B3JS: C# compile mode set to ${mode.toUpperCase()}`);
}

// ─── Default C# Script ────────────────────────────────────────
const DEFAULT_CSHARP_SCRIPT = `using B3JS;

public class MyScript : B3Script
{
    public override void Execute(float delta)
    {
        // Access the object's properties
        float health = GetHealth();
        float speed = GetSpeed();
        
        // Keyboard input
        if (GetKey("KeyW"))
            Translate(0, 0, -speed * delta);
        if (GetKey("KeyS"))
            Translate(0, 0, speed * delta);
        
        // Visual feedback
        if (health < 30)
            Log("Low health warning!");
    }
}`;

// ─── C# Controller ────────────────────────────────────────────

export class CSharpController extends Controller {
    /** Shared .NET WASM runtime — lazy-loaded on first C# node */
    static dotnetRuntime: any = null;
    static runtimeLoading: Promise<void> | null = null;
    static serverEndpoint: string = 'http://localhost:5050/compile';

    private assembly: any = null;
    private isReady = false;
    private compiledModule: any = null;

    // Sandboxed bridge — these values are pushed to C# before each Execute()
    private bridgeState = {
        delta: 0,
        health: 100,
        speed: 0.1,
        posX: 0, posY: 0, posZ: 0,
        keys: new Set<string>(),
        // Output commands from C# → engine
        commands: [] as Array<{ type: string, args: any[] }>
    };

    private keyDown = (e: KeyboardEvent) => this.bridgeState.keys.add(e.code);
    private keyUp = (e: KeyboardEvent) => this.bridgeState.keys.delete(e.code);

    constructor(public script: string = DEFAULT_CSHARP_SCRIPT) {
        super();
        window.addEventListener('keydown', this.keyDown);
        window.addEventListener('keyup', this.keyUp);
    }

    getTypeName() { return 'CSharpController'; }

    /** When false, scripts from deserialized/shared scenes will not execute. */
    static allowUntrustedScripts: boolean = false;
    /** Set to true for scripts authored locally in this session. */
    public isTrusted: boolean = true;

    // ─── Runtime Bootstrap ─────────────────────────────────────

    /**
     * Lazy-load the .NET WASM runtime.
     * Only called when the first CSharpController is created.
     */
    private async ensureRuntime() {
        if (CSharpController.dotnetRuntime) return;
        if (CSharpController.runtimeLoading) {
            await CSharpController.runtimeLoading;
            return;
        }

        CSharpController.runtimeLoading = (async () => {
            try {
                console.log('B3JS: Loading .NET WASM runtime...');
                // Attempt to load the standalone dotnet.js bootstrapper
                const dotnetPath = '/dotnet/dotnet.js';
                const dotnetModule = await import(/* @vite-ignore */ dotnetPath);
                CSharpController.dotnetRuntime = await dotnetModule.dotnet.create();
                console.log('B3JS: .NET WASM runtime loaded successfully.');
            } catch (e) {
                console.warn('B3JS: .NET WASM runtime not available. C# scripts will use server compilation.', e);
            }
        })();

        await CSharpController.runtimeLoading;
    }

    // ─── Compilation ───────────────────────────────────────────

    /**
     * Compile the C# script using the active compilation mode.
     */
    async compile(): Promise<boolean> {
        const mode = getCSharpCompileMode();
        console.log(`B3JS: Compiling C# (${mode} mode)...`);

        try {
            if (mode === 'server') {
                return await this.compileServer();
            } else {
                return await this.compileClient();
            }
        } catch (e) {
            console.error('B3JS: C# Compilation Error', e);
            return false;
        }
    }

    /** Server-side compilation: POST script → receive compiled assembly bytes */
    private async compileServer(): Promise<boolean> {
        try {
            const response = await fetch(CSharpController.serverEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script: this.script })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('B3JS: Server compile error:', error);
                return false;
            }

            const result = await response.json();
            this.compiledModule = result;
            this.isReady = true;
            console.log('B3JS: C# script compiled successfully (server).');
            return true;
        } catch (e) {
            console.error('B3JS: Cannot reach compile server at', CSharpController.serverEndpoint);
            return false;
        }
    }

    /** Client-side compilation: Use .NET WASM Roslyn (if available) */
    private async compileClient(): Promise<boolean> {
        await this.ensureRuntime();

        if (!CSharpController.dotnetRuntime) {
            console.warn('B3JS: .NET runtime not available. Falling back to server compile.');
            return this.compileServer();
        }

        try {
            // Use the exposed [JSExport] compile method from the WASM module
            const result = CSharpController.dotnetRuntime.invoke('B3JS.Compiler', 'Compile', this.script);
            if (result.success) {
                this.compiledModule = result.assembly;
                this.isReady = true;
                console.log('B3JS: C# script compiled successfully (client WASM).');
                return true;
            } else {
                console.error('B3JS: Compile errors:', result.errors);
                return false;
            }
        } catch (e) {
            console.error('B3JS: Client compile failed', e);
            return false;
        }
    }

    // ─── Execution ─────────────────────────────────────────────

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this.isReady || !this.compiledModule) return;
        if (!this.isTrusted && !CSharpController.allowUntrustedScripts) return;

        // Update bridge state with current frame data
        this.bridgeState.delta = delta;
        this.bridgeState.health = b3obj.health;
        this.bridgeState.speed = b3obj.speed;
        this.bridgeState.posX = b3obj.object.position.x;
        this.bridgeState.posY = b3obj.object.position.y;
        this.bridgeState.posZ = b3obj.object.position.z;
        this.bridgeState.commands = [];

        try {
            if (CSharpController.dotnetRuntime && getCSharpCompileMode() === 'client') {
                // Execute via .NET WASM interop
                CSharpController.dotnetRuntime.invoke(
                    'B3JS.Runtime', 'Execute',
                    JSON.stringify(this.bridgeState)
                );
            } else {
                // Execute via interpreted bridge (server-compiled assemblies)
                this.executeInterpreted(delta, b3obj, engine);
            }

            // Process output commands from C# → engine
            this.processBridgeCommands(b3obj, engine);
        } catch (e) {
            if (Math.random() < 0.01) console.error('B3JS: C# Runtime Error', e);
        }
    }

    /** Lightweight fallback executor for server-compiled scripts */
    private executeInterpreted(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        // The server returns a simplified AST that we interpret
        // This is a fallback — the WASM path is preferred
        if (this.compiledModule?.commands) {
            this.bridgeState.commands = this.compiledModule.commands;
        }
    }

    /** Apply commands that C# pushed to the bridge */
    private processBridgeCommands(b3obj: B3ObjectRef, engine: B3EngineRef) {
        for (const cmd of this.bridgeState.commands) {
            switch (cmd.type) {
                case 'translate':
                    b3obj.object.position.x += cmd.args[0];
                    b3obj.object.position.y += cmd.args[1];
                    b3obj.object.position.z += cmd.args[2];
                    break;
                case 'rotate':
                    b3obj.object.rotation.x += cmd.args[0];
                    b3obj.object.rotation.y += cmd.args[1];
                    b3obj.object.rotation.z += cmd.args[2];
                    break;
                case 'set_health':
                    b3obj.health = cmd.args[0];
                    break;
                case 'log':
                    console.log(`[C#] ${cmd.args[0]}`);
                    break;
                case 'set_color':
                    if (b3obj.object.material) {
                        b3obj.object.material.color.setRGB(cmd.args[0], cmd.args[1], cmd.args[2]);
                    }
                    break;
            }
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.execute(delta, b3obj, engine);
    }

    dispose() {
        window.removeEventListener('keydown', this.keyDown);
        window.removeEventListener('keyup', this.keyUp);
    }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CSharpController',
            label: 'C# Script',
            category: 'Script',
            color: '#68217a',
            description: 'Execute C# scripts via .NET WASM',
            icon: '🟣'
        };
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'CSharpController',
            script: this.script,
            sensorIds: this.sensors.map(s => s.id),
            actuatorIds: this.actuators.map(a => a.id)
        };
    }

    static fromJSON(data: any): CSharpController {
        const node = new CSharpController(data.script);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        node.isTrusted = false; // Deserialized scripts are UNTRUSTED by default
        return node;
    }
}
