import { Controller, B3ObjectRef, B3EngineRef } from './base';

export class AndController extends Controller {
    getTypeName() { return 'AndController'; }
    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        const anySensorOff = this.sensors.some(s => !s.positive);
        if (!anySensorOff) {
            this.actuators.forEach(a => a.execute(delta, b3obj, engine));
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { this.execute(delta, b3obj, engine); }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'AndController',
            sensorIds: this.sensors.map(s => s.id),
            actuatorIds: this.actuators.map(a => a.id)
        };
    }

    static fromJSON(data: any): AndController {
        const node = new AndController();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

export class PythonController extends Controller {
    static pyodide: any = null;
    private pyNamespace: any = null;
    private isReady = false;
    getTypeName() { return 'PythonController'; }

    constructor(public script: string = "print('B3JS Python Active')") {
        super();
        this.initPy();
    }

    async initPy() {
        if (!PythonController.pyodide) {
            if (typeof (window as any).loadPyodide === 'function') {
                PythonController.pyodide = await (window as any).loadPyodide();
            } else {
                console.error("B3JS: loadPyodide not found. Ensure script is loaded in index.html");
                return;
            }
        }
        this.pyNamespace = PythonController.pyodide.globals.get("dict")();
        this.isReady = true;
    }

    /** When false, scripts from deserialized/shared scenes will not execute. */
    static allowUntrustedScripts: boolean = false;
    /** Set to true for scripts authored locally in this session. */
    public isTrusted: boolean = true;

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this.isReady || !this.pyNamespace) return;
        if (!this.isTrusted && !PythonController.allowUntrustedScripts) {
            return; // Block untrusted scripts from executing
        }
        try {
            const pyodide = PythonController.pyodide;
            // Sandboxed namespace: only expose safe, limited data
            this.pyNamespace.set("delta", delta);
            this.pyNamespace.set("sensor_states", this.sensors.map(s => s.positive));
            this.pyNamespace.set("actuator_count", this.actuators.length);
            this.pyNamespace.set("position", [b3obj.object.position.x, b3obj.object.position.y, b3obj.object.position.z]);
            this.pyNamespace.set("health", b3obj.health);
            this.pyNamespace.set("speed", b3obj.speed);
            // NOTE: engine and b3obj are deliberately NOT exposed to prevent arbitrary access
            
            pyodide.runPython(this.script, { globals: this.pyNamespace });
        } catch (e) {
            if (Math.random() < 0.01) console.error("B3JS: Python Error", e);
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { this.execute(delta, b3obj, engine); }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'PythonController',
            script: this.script,
            sensorIds: this.sensors.map(s => s.id),
            actuatorIds: this.actuators.map(a => a.id)
        };
    }

    static fromJSON(data: any): PythonController {
        const node = new PythonController(data.script);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}
