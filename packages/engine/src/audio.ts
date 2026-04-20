import * as THREE from 'three';

export type AudioConfig = {
    fftSize: number;
    isStereo: boolean;
};

/**
 * AudioManager: Central hub for Web Audio and Spatial Listener
 */
export class AudioManager {
    private context: AudioContext | null = null;
    private listener: THREE.AudioListener;
    private masterGain: GainNode | null = null;
    private analyser: THREE.AudioAnalyser | null = null;
    private config: AudioConfig = { fftSize: 2048, isStereo: true };

    constructor() {
        this.listener = new THREE.AudioListener();
    }

    public getListener(): THREE.AudioListener {
        return this.listener;
    }

    /**
     * Initialize AudioContext. Must be called after user interaction.
     */
    public async resume(): Promise<void> {
        if (!this.context) {
            this.context = THREE.AudioContext.getContext() as AudioContext;
        }

        if (this.context) {
            if (!this.masterGain) {
                this.masterGain = this.context.createGain();
                this.masterGain.connect(this.context.destination);
            }

            if (this.context.state === 'suspended') {
                await this.context.resume();
            }
            console.log("B3JS Engine: Audio Context Resumed");
        }
    }

    public setupAnalyser(source: THREE.Audio<AudioNode>) {
        this.analyser = new THREE.AudioAnalyser(source, this.config.fftSize);
    }

    public getFrequencyData(): Uint8Array {
        if (!this.analyser) return new Uint8Array(this.config.fftSize / 2);
        return this.analyser.getFrequencyData();
    }

    public setStereo(enabled: boolean) {
        this.config.isStereo = enabled;
        // In Three.js, PositionalAudio handles this via panner settings
        console.log(`B3JS Engine: Audio mode set to ${enabled ? 'Stereo' : 'Mono'}`);
    }

    public isReady(): boolean {
        return !!this.context && this.context.state === 'running';
    }

    /**
     * Creates a spatial audio source from a remote MediaStream (Voice Chat)
     */
    public addRemoteVoiceStream(stream: MediaStream, target: THREE.Object3D): THREE.PositionalAudio | null {
        if (!this.context) {
            console.warn("B3JS Engine: Audio Context not initialized for voice stream");
            return null;
        }

        const source = this.context.createMediaStreamSource(stream);
        const pAudio = new THREE.PositionalAudio(this.listener);
        
        // This links the raw Web Audio source to Three.js audio system
        pAudio.setNodeSource(source as any);
        pAudio.setRefDistance(2);
        pAudio.setMaxDistance(20);
        
        target.add(pAudio);
        return pAudio;
    }
}
