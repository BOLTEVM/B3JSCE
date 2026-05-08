/// <reference types="web-bluetooth" />
import * as THREE from 'three';
import { B3Engine } from './index';

/**
 * ProTubeManager: Handles ProTubeVR (ForceTube) haptics via WebBluetooth.
 */
export class ProTubeManager {
    private device: BluetoothDevice | null = null;
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private isConnected: boolean = false;
    private isConnecting: boolean = false;

    // Standard ForceTube GATT UUIDs (Probable based on research)
    private readonly SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
    private readonly CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

    constructor(private engine: B3Engine) {}

    /**
     * Scans for and connects to a ProTubeVR device.
     * Note: Must be called from a user gesture (button click).
     */
    public async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            console.log('B3JS ProTube: Scanning for ForceTube devices...');
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'ForceTube' }],
                optionalServices: [this.SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());

            console.log(`B3JS ProTube: Connecting to ${this.device.name}...`);
            const server = await this.device.gatt?.connect();
            const service = await server?.getPrimaryService(this.SERVICE_UUID);
            this.characteristic = await service?.getCharacteristic(this.CHAR_UUID) || null;

            this.isConnected = true;
            console.log('B3JS ProTube: Connected successfully.');
        } catch (error) {
            console.error('B3JS ProTube: Connection failed', error);
            this.isConnected = false;
        } finally {
            this.isConnecting = false;
        }
    }

    private onDisconnected() {
        console.warn('B3JS ProTube: Device disconnected.');
        this.isConnected = false;
        this.characteristic = null;
    }

    /**
     * Triggers a recoil kick.
     * @param intensity 0.0 to 1.0
     */
    public triggerKick(intensity: number = 1.0) {
        if (!this.isConnected || !this.characteristic) return;

        // Map 0.0-1.0 to 0-255
        const val = Math.floor(THREE.MathUtils.clamp(intensity, 0, 1) * 255);
        
        // Protocol: [0x01, intensity]
        const data = new Uint8Array([0x01, val]);
        
        this.characteristic.writeValue(data).catch((e: any) => {
            console.warn('B3JS ProTube: Failed to write haptic command', e);
        });
    }

    public getStatus() {
        return {
            connected: this.isConnected,
            device: this.device?.name || 'None',
            connecting: this.isConnecting
        };
    }

    public disconnect() {
        if (this.device?.gatt?.connected) {
            this.device.gatt.disconnect();
        }
    }
}
