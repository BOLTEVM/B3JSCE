import { B3Engine } from '../index';

export type RobotConnectionStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

export interface TelemetryData {
    timestamp: number;
    jointStates: Map<string, number>;
    batteryLevel?: number;
    status: string;
}

/**
 * IRobotInterface: Standardized interface for any robotic platform.
 */
export interface IRobotInterface {
    connect(uri: string): Promise<boolean>;
    disconnect(): void;
    getStatus(): RobotConnectionStatus;
    
    // Locomotion
    move(linear: { x: number, y: number, z: number }, angular: { x: number, y: number, z: number }): void;
    
    // Feedback
    getTelemetry(): TelemetryData;
    onTelemetry(callback: (data: TelemetryData) => void): void;
    
    // Video
    getVideoStreamURI(): string | null;
}

/**
 * RoboticsManager: Orchestrates multiple robotic interfaces and their Digital Twins.
 */
export abstract class RoboticsManager implements IRobotInterface {
    protected status: RobotConnectionStatus = 'Disconnected';
    protected telemetry: TelemetryData = { timestamp: Date.now(), jointStates: new Map(), status: 'Idle' };
    protected telemetryCallbacks: ((data: TelemetryData) => void)[] = [];

    constructor(protected engine: B3Engine) {}

    abstract connect(uri: string): Promise<boolean>;
    abstract disconnect(): void;
    abstract move(linear: { x: number, y: number, z: number }, angular: { x: number, y: number, z: number }): void;
    
    getStatus(): RobotConnectionStatus {
        return this.status;
    }

    getTelemetry(): TelemetryData {
        return this.telemetry;
    }

    onTelemetry(callback: (data: TelemetryData) => void): void {
        this.telemetryCallbacks.push(callback);
    }

    protected notifyTelemetry() {
        this.telemetryCallbacks.forEach(cb => cb(this.telemetry));
    }

    abstract getVideoStreamURI(): string | null;
}
