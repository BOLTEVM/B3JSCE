import * as THREE from 'three';
import { Actuator } from './base';
import { execIn, dataIn, dataOut } from './pins';

/**
 * AudioReactiveActuator: Links mesh properties to audio frequency bands.
 */
export class AudioReactiveActuator extends Actuator {
    private initialScales: Map<string, THREE.Vector3> = new Map();
    private initialMaterials: Map<string, any> = new Map();

    constructor() {
        super();
        this.inputs = [
            execIn(this.id, 'In'),
            dataIn(this.id, 'AudioId', 'string', 'default'),
            dataIn(this.id, 'Band', 'string', 'volume'), // volume, bass, mid, treble
            dataIn(this.id, 'ScaleMult', 'number', 1.0),
            dataIn(this.id, 'Intensity', 'number', 1.0),
            dataIn(this.id, 'Color', 'color', '#ffffff'),
            dataIn(this.id, 'MeshName', 'string', '')
        ];
    }

    getTypeName() { return 'AudioReactiveActuator'; }

    update(delta: number, b3obj: any, engine: any) {
        if (!engine || !engine.audio || !b3obj || !b3obj.object) return;

        const audioId = this.getInput('AudioId');
        const band = this.getInput('Band');
        const scaleMult = this.getInput('ScaleMult');
        const intensity = this.getInput('Intensity');
        const baseColor = new THREE.Color(this.getInput('Color'));
        const meshFilter = this.getInput('MeshName');

        const val = engine.audio.getBandIntensity(band, audioId);

        b3obj.object.traverse((child: any) => {
            if (child.isMesh) {
                if (meshFilter && !child.name.includes(meshFilter)) return;

                // 1. Handle Scaling
                if (!this.initialScales.has(child.uuid)) {
                    this.initialScales.set(child.uuid, child.scale.clone());
                }
                const baseScale = this.initialScales.get(child.uuid)!;
                const s = 1.0 + val * scaleMult;
                child.scale.set(baseScale.x * s, baseScale.y * s, baseScale.z * s);

                // 2. Handle Emissive Color
                const updateMat = (m: any) => {
                    if (m.emissive) {
                        m.emissive.copy(baseColor).multiplyScalar(val * intensity);
                        if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.0 + val * 2.0;
                    }
                };

                if (Array.isArray(child.material)) {
                    child.material.forEach(updateMat);
                } else if (child.material) {
                    updateMat(child.material);
                }
            }
        });
    }

    static fromJSON(data: any): AudioReactiveActuator {
        const n = new AudioReactiveActuator();
        n.id = data.id; n.restorePins(data);
        return n;
    }
}

/**
 * SpinnerActuator: Continuously rotates meshes or groups.
 */
export class SpinnerActuator extends Actuator {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id, 'In'),
            dataIn(this.id, 'SpeedX', 'number', 0),
            dataIn(this.id, 'SpeedY', 'number', 1.0),
            dataIn(this.id, 'SpeedZ', 'number', 0),
            dataIn(this.id, 'MeshName', 'string', '')
        ];
    }

    getTypeName() { return 'SpinnerActuator'; }

    update(delta: number, b3obj: any, engine: any) {
        if (!b3obj || !b3obj.object) return;

        const sx = this.getInput('SpeedX');
        const sy = this.getInput('SpeedY');
        const sz = this.getInput('SpeedZ');
        const meshFilter = this.getInput('MeshName');

        b3obj.object.traverse((child: any) => {
            if (meshFilter && !child.name.includes(meshFilter)) return;
            
            // Avoid spinning the root if filtering, or spin everything if no filter
            if (!meshFilter || child.name.includes(meshFilter)) {
                child.rotation.x += sx * delta;
                child.rotation.y += sy * delta;
                child.rotation.z += sz * delta;
            }
        });
    }

    static fromJSON(data: any): SpinnerActuator {
        const n = new SpinnerActuator();
        n.id = data.id; n.restorePins(data);
        return n;
    }
}

/**
 * VideoPlayerActuator: Plays video on a target mesh.
 */
export class VideoPlayerActuator extends Actuator {
    private video: HTMLVideoElement | null = null;
    private texture: THREE.VideoTexture | null = null;
    private initialized: boolean = false;

    constructor() {
        super();
        this.inputs = [
            execIn(this.id, 'Play'),
            dataIn(this.id, 'VideoURL', 'string', ''),
            dataIn(this.id, 'Volume', 'number', 0.5),
            dataIn(this.id, 'MeshName', 'string', 'Screens')
        ];
    }

    getTypeName() { return 'VideoPlayerActuator'; }

    update(delta: number, b3obj: any, engine: any) {
        if (!b3obj || !b3obj.object || this.initialized) return;

        const url = this.getInput('VideoURL');
        const meshName = this.getInput('MeshName');
        if (!url) return;

        const target = b3obj.object.getObjectByName(meshName) || b3obj.object;
        if (target && (target as any).isMesh) {
            this.video = document.createElement('video');
            this.video.src = url;
            this.video.loop = true;
            this.video.muted = true; // Autoplay requirement
            this.video.play();

            this.texture = new THREE.VideoTexture(this.video);
            (target as any).material.map = this.texture;
            (target as any).material.needsUpdate = true;
            this.initialized = true;
            console.log(`B3JS: Video Player initialized for ${meshName} -> ${url}`);
        }
    }

    static fromJSON(data: any): VideoPlayerActuator {
        const n = new VideoPlayerActuator();
        n.id = data.id; n.restorePins(data);
        return n;
    }
}
