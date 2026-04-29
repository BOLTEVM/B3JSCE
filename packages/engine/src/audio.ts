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

    private analysers: Map<string, THREE.AudioAnalyser> = new Map();

    public setupAnalyser(source: THREE.Audio<AudioNode>, id: string = 'default') {
        const analyser = new THREE.AudioAnalyser(source, this.config.fftSize);
        this.analysers.set(id, analyser);
    }

    public getFrequencyData(id: string = 'default'): Uint8Array {
        const analyser = this.analysers.get(id);
        if (!analyser) return new Uint8Array(this.config.fftSize / 2);
        return analyser.getFrequencyData();
    }

    public getAverageFrequency(id: string = 'default'): number {
        const analyser = this.analysers.get(id);
        return analyser ? analyser.getAverageFrequency() : 0;
    }

    /**
     * Extracts frequency intensity for specific bands.
     * Bass: 0-250Hz, Mid: 250-2000Hz, Treble: 2000Hz+
     */
    public getBandIntensity(band: 'volume' | 'bass' | 'mid' | 'treble', id: string = 'default'): number {
        const analyser = this.analysers.get(id);
        if (!analyser) return 0;

        const data = analyser.getFrequencyData();
        const binCount = data.length;
        
        // FFT bin to frequency mapping: freq = binIndex * (sampleRate / fftSize)
        // Assuming 44100Hz sample rate and 2048 FFT size: 1 bin ~= 21.5Hz
        
        if (band === 'volume') return analyser.getAverageFrequency() / 255;

        let start = 0;
        let end = 0;

        if (band === 'bass') {
            start = 0;
            end = Math.floor(250 / 21.5);
        } else if (band === 'mid') {
            start = Math.floor(250 / 21.5);
            end = Math.floor(2000 / 21.5);
        } else if (band === 'treble') {
            start = Math.floor(2000 / 21.5);
            end = binCount;
        }

        let sum = 0;
        for (let i = start; i < end; i++) {
            sum += data[i];
        }
        
        return (sum / (end - start)) / 255;
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
