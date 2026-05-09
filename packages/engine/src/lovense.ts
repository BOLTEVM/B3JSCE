import * as THREE from 'three';
import { B3Engine } from './index';
import { registerActuatorType } from './core/registry';

export type LovenseGameMode = 'Active' | 'Paused' | 'Menu';

export interface LovenseToy {
    id: string;
    name: string;
    type: string;
    battery: number;
    status: number;
}

/**
 * LovenseManager: Handles local and cloud control for Lovense hardware.
 * Supports PC (Local Loopback) and Mobile (QR/Callback) discovery.
 */
export class LovenseManager {
    private isConnected: boolean = false;
    private mode: LovenseGameMode = 'Active';
    private toys: Map<string, LovenseToy> = new Map();
    private localUrl: string = 'https://127-0-0-1.lovense.club:30010';
    private devToken: string = '';
    private refreshInterval: any = null;

    constructor(private engine: B3Engine) {
        this.loadSettings();
        this.init();
    }

    private loadSettings() {
        this.devToken = localStorage.getItem('B3JS_LOVENSE_DEV_TOKEN') || '';
    }

    public updateSettings(token: string) {
        this.devToken = token;
        localStorage.setItem('B3JS_LOVENSE_DEV_TOKEN', token);
    }

    private async init() {
        console.log('B3JS Lovense: Initializing local controller check...');
        this.refreshToys();
        this.refreshInterval = setInterval(() => this.refreshToys(), 10000);
    }

    /**
     * Polls the local Lovense Connect server for connected toys.
     */
    public async refreshToys() {
        if (this.mode === 'Paused') return;

        try {
            const response = await fetch(`${this.localUrl}/status`, { method: 'GET' });
            const data = await response.json();
            
            if (data.status === 200) {
                const newToys = new Map();
                Object.entries(data.data.toys).forEach(([id, toy]: [string, any]) => {
                    newToys.set(id, {
                        id,
                        name: toy.name,
                        type: toy.type,
                        battery: toy.battery,
                        status: toy.status
                    });
                });
                this.toys = newToys;
                if (!this.isConnected) {
                    console.log(`B3JS Lovense: Connected to local server. Found ${this.toys.size} toys.`);
                    this.isConnected = true;
                }
            }
        } catch (e) {
            if (this.isConnected) {
                console.warn('B3JS Lovense: Local server disconnected.');
                this.isConnected = false;
            }
        }
    }

    /**
     * Sends a command to a specific toy or all toys.
     * @param command Command name (vibrate, rotate, air, linear)
     * @param level Intensity (0-20)
     * @param toyId Optional toy ID
     */
    public async sendCommand(command: string, level: number, toyId?: string) {
        if (this.mode === 'Paused' && level > 0) return;

        const cmd = {
            command: 'Function',
            action: `${command}:${Math.floor(THREE.MathUtils.clamp(level, 0, 20))}`,
            toy: toyId,
            apiVer: 1
        };

        try {
            await fetch(`${this.localUrl}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cmd)
            });
        } catch (e) {
            console.warn('B3JS Lovense: Failed to send command', e);
        }
    }

    /**
     * Executes a pre-defined pattern.
     * @param pattern String pattern (e.g., "V:1;S:100;strength:20;50;10;100")
     */
    public async playPattern(pattern: string, toyId?: string) {
        const cmd = {
            command: 'PatternV2',
            rule: 'V:1;S:100',
            strength: pattern,
            toy: toyId,
            apiVer: 2
        };

        try {
            await fetch(`${this.localUrl}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cmd)
            });
        } catch (e) {
            console.warn('B3JS Lovense: Failed to play pattern', e);
        }
    }

    /**
     * Safety Stop: Halts all connected toys.
     */
    public stopAll() {
        this.sendCommand('all', 0);
    }

    public setMode(mode: LovenseGameMode) {
        this.mode = mode;
        if (mode === 'Paused') {
            this.stopAll();
        }
    }

    public getToys() {
        return Array.from(this.toys.values());
    }

    public getStatus() {
        return this.isConnected;
    }
}
