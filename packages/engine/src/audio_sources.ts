import * as THREE from 'three';
import { B3Object } from './index';

/**
 * B3AudioSource: A component-like wrapper for PositionalAudio
 */
export class B3AudioSource {
    public audio: THREE.PositionalAudio;
    public loader: THREE.AudioLoader;
    public isLoaded: boolean = false;

    constructor(listener: THREE.AudioListener, url: string) {
        this.audio = new THREE.PositionalAudio(listener);
        this.loader = new THREE.AudioLoader();
        
        this.load(url);
    }

    private load(url: string) {
        this.loader.load(url, (buffer) => {
            this.audio.setBuffer(buffer);
            this.audio.setRefDistance(20);
            this.isLoaded = true;
            console.log(`B3JS: Audio loaded from ${url}`);
        });
    }

    public play() {
        if (this.isLoaded && !this.audio.isPlaying) {
            this.audio.play();
        }
    }

    public stop() {
        if (this.audio.isPlaying) {
            this.audio.stop();
        }
    }
}
