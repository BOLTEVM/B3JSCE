import * as THREE from 'three';
import Tact, { PositionType } from 'tact-js';
import { B3Engine } from './index';

/**
 * HapticsManager: Orchestrates BHaptics feedback for the engine.
 * Connects to the bHaptics Player via WebSockets.
 */
export class HapticsManager {
    private isConnected: boolean = false;
    private isInitializing: boolean = false;
    private appId: string = 'com.b3js.engine';
    private apiKey: string = '';
    private devices: any[] = [];
    private pollInterval: any = null;
    private autoDetectInterval: any = null;

    constructor(private engine: B3Engine) {
        this.loadSettings();
        this.init();
        
        // Start background auto-detection loop (reconnect watchdog)
        this.autoDetectInterval = setInterval(() => {
            if (!this.isConnected && !this.isInitializing) {
                console.log('B3JS Haptics: Auto-scanning for local hardware...');
                this.init();
            }
        }, 15000); // 15s check is enough for background
    }

    private startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.refreshDevices(), 5000);
    }

    private async refreshDevices() {
        if (!this.isConnected) return;

        try {
            const newDevices = await this.getDevices();
            // Only update and log if devices changed to prevent noise
            if (JSON.stringify(newDevices) !== JSON.stringify(this.devices)) {
                this.devices = newDevices;
                console.log(`B3JS Haptics: Device map updated. (${this.devices.length} active)`);
            }
        } catch (e) {
            console.warn('B3JS Haptics: Polling failed, connection likely closed.');
            this.isConnected = false;
        }
    }

    public getConnectedDevicesList() {
        return this.devices;
    }


    private loadSettings() {
        this.appId = localStorage.getItem('B3JS_BHAPTICS_APP_ID') || 'com.b3js.engine';
        this.apiKey = localStorage.getItem('B3JS_BHAPTICS_API_KEY') || '';
    }

    public async updateSettings(appId: string, apiKey: string) {
        this.appId = appId;
        this.apiKey = apiKey;
        localStorage.setItem('B3JS_BHAPTICS_APP_ID', appId);
        localStorage.setItem('B3JS_BHAPTICS_API_KEY', apiKey);
        await this.init();
    }

    private async init() {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            console.log(`B3JS Haptics: Connecting to Player (App: ${this.appId})...`);
            await Tact.init({
                appId: this.appId,
                apiKey: this.apiKey
            });
            this.isConnected = true;
            console.log('B3JS Haptics: Initialized BHaptics connection.');
            
            // Immediate fetch after connection to avoid "Loading..." stall
            await this.refreshDevices();
            this.startPolling();
        } catch (e) {
            console.error('B3JS Haptics: Failed to initialize BHaptics.', e);
            this.isConnected = false;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Triggers a spatialized haptic event.
     * @param eventKey The key defined in bHaptics Designer.
     * @param impactPos The world position of the event.
     * @param intensity Ratio (0.0 to 1.0).
     */
    public triggerSpatial(eventKey: string, impactPos: THREE.Vector3, intensity: number = 1.0) {
        if (!this.isConnected) return;

        // Convert world impact position to local space relative to the XR Rig
        const localPos = this.engine.xrRig.worldToLocal(impactPos.clone());
        
        // Calculate Angle (Yaw) for Horizontal Mapping (0.0 to 1.0)
        // bHaptics offsetX: 0.0=Front, 0.25=Right, 0.5=Back, 0.75=Left
        const angle = Math.atan2(localPos.x, localPos.z);
        const offsetX = (angle / (Math.PI * 2) + 1.0) % 1.0;


        // Calculate Vertical Mapping (offsetY: -0.5 to 0.5)
        const offsetY = Math.max(-0.5, Math.min(0.5, localPos.y / 2));

        Tact.play({
            eventKey: eventKey,
            offsetX: offsetX,
            offsetY: offsetY,
            intensityRatio: intensity,
            durationRatio: 1.0
        });
    }

    /**
     * Triggers a specific motor pattern (Dot mode).
     * @param position The limb/device position (e.g., 'VestFront').
     * @param motorValues Array of intensities (0-100).
     * @param duration Duration in ms.
     */
    public triggerDots(position: string, motorValues: number[], duration: number = 100) {
        if (!this.isConnected) return;

        let pos = PositionType.Vest;
        if (position === 'HandL') pos = PositionType.HandL;
        if (position === 'HandR') pos = PositionType.HandR;
        if (position === 'GloveL') pos = PositionType.GloveL;
        if (position === 'GloveR') pos = PositionType.GloveR;
        if (position === 'Head') pos = PositionType.Head;
        if (position === 'FootL') pos = PositionType.FootL;
        if (position === 'FootR') pos = PositionType.FootR;

        Tact.playDot({
            position: pos,
            motorValues: motorValues,
            duration: duration
        });
    }

    /**
     * Stops all active haptic patterns.
     */
    public stopAll() {
        if (this.isConnected) Tact.stopAll();
    }

    public async getDevices() {
        if (!this.isConnected) return [];
        try {
            return await Tact.getConnectedDevices();
        } catch (e) {
            return [];
        }
    }

    public getStatus() {
        return this.isConnected;
    }
}

