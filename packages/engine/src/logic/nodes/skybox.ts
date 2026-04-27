import * as THREE from 'three';
import { LogicNode } from '../base';
import { execIn, execOut, dataIn, dataOut } from '../pins';
import type { ExecutionContext, NodeInfo } from '../graph';

// ─── Procedural Sky Shader ─────────────────────────────────────
// A gradient dome shader with configurable zenith, horizon, and nadir
// colors, sun position, and atmospheric scattering intensity.

const SKY_VERTEX = `
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
uniform vec3 uSunPosition;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vSunDirection = normalize(uSunPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uNadirColor;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunSize;
uniform float uAtmosphere;
uniform float uStarIntensity;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vSunDirection;

// Simple hash for stars
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec3 dir = normalize(vWorldPosition);
    float y = dir.y;

    // Three-band gradient: nadir → horizon → zenith
    vec3 skyColor;
    if (y >= 0.0) {
        float t = pow(y, uAtmosphere);
        skyColor = mix(uHorizonColor, uZenithColor, t);
    } else {
        float t = pow(-y, 0.5);
        skyColor = mix(uHorizonColor, uNadirColor, t);
    }

    // Sun disc
    float sunDot = max(dot(dir, vSunDirection), 0.0);
    float sunDisc = smoothstep(1.0 - uSunSize * 0.01, 1.0, sunDot);
    skyColor += uSunColor * sunDisc * uSunIntensity;

    // Sun glow (atmospheric scattering)
    float glow = pow(sunDot, 8.0) * uSunIntensity * 0.3;
    skyColor += uSunColor * glow;

    // Stars (visible when sky is dark)
    float darkness = 1.0 - clamp(uSunIntensity * max(vSunDirection.y + 0.1, 0.0), 0.0, 1.0);
    if (darkness > 0.1 && y > 0.0) {
        vec2 starUV = dir.xz / (y + 0.001) * 50.0;
        float star = step(0.998, hash(floor(starUV)));
        float twinkle = 0.5 + 0.5 * sin(uTime * 2.0 + hash(floor(starUV)) * 6.28);
        skyColor += vec3(star * darkness * uStarIntensity * twinkle);
    }

    gl_FragColor = vec4(skyColor, 1.0);
}
`;

/**
 * Creates a procedural sky mesh with a ShaderMaterial.
 * Returns both the B3Object and a reference to the uniforms for node control.
 */
export function createProceduralSky(): { mesh: THREE.Mesh, uniforms: Record<string, THREE.IUniform> } {
    const uniforms: Record<string, THREE.IUniform> = {
        uZenithColor:  { value: new THREE.Color(0x0a1628) },
        uHorizonColor: { value: new THREE.Color(0x1a233a) },
        uNadirColor:   { value: new THREE.Color(0x050510) },
        uSunColor:     { value: new THREE.Color(0xffeedd) },
        uSunPosition:  { value: new THREE.Vector3(100, 60, 50) },
        uSunIntensity: { value: 1.0 },
        uSunSize:      { value: 3.0 },
        uAtmosphere:   { value: 0.8 },
        uStarIntensity:{ value: 1.0 },
        uTime:         { value: 0 }
    };

    const geo = new THREE.SphereGeometry(500, 64, 32);
    const mat = new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms,
        side: THREE.BackSide,
        depthWrite: false
    });

    return { mesh: new THREE.Mesh(geo, mat), uniforms };
}

// ─── Skybox Logic Nodes ────────────────────────────────────────

/**
 * SetSkyColorNode: Dynamically change zenith, horizon, and nadir colors.
 */
export class SetSkyColorNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Zenith', 'number', 0x0a1628),
            dataIn(this.id, 'Horizon', 'number', 0x1a233a),
            dataIn(this.id, 'Nadir', 'number', 0x050510)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'SetSkyColorNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const skyObj = ctx.engine.objects.find((o: any) => o.type === 'Skybox');
        if (!skyObj) return;

        const mat = (skyObj.object as THREE.Mesh).material as THREE.ShaderMaterial;
        if (!mat?.uniforms?.uZenithColor) return;

        const zenith = this.getInput('Zenith') ?? 0x0a1628;
        const horizon = this.getInput('Horizon') ?? 0x1a233a;
        const nadir = this.getInput('Nadir') ?? 0x050510;

        mat.uniforms.uZenithColor.value.setHex(zenith);
        mat.uniforms.uHorizonColor.value.setHex(horizon);
        mat.uniforms.uNadirColor.value.setHex(nadir);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SetSkyColorNode', label: 'Set Sky Color', category: 'Action', color: '#1d3557', description: 'Change sky gradient colors', icon: '🌈' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SetSkyColorNode' }; }
    static fromJSON(data: any): SetSkyColorNode {
        const n = new SetSkyColorNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * DayNightCycleNode: Automatically cycles sun position and sky colors over time.
 */
export class DayNightCycleNode extends LogicNode {
    private elapsed = 0;

    constructor() {
        super();
        this.inputs = [
            dataIn(this.id, 'CycleDuration', 'number', 120),    // Full cycle in seconds
            dataIn(this.id, 'StartTime', 'number', 0.25)        // 0-1 normalized (0.25 = sunrise)
        ];
        this.outputs = [
            execOut(this.id, 'Tick'),
            dataOut(this.id, 'TimeOfDay', 'number'),     // 0-1 normalized
            dataOut(this.id, 'IsNight', 'boolean'),
            dataOut(this.id, 'SunAngle', 'number')
        ];
    }

    getTypeName() { return 'DayNightCycleNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const duration = this.getInput('CycleDuration') || 120;
        const startTime = this.getInput('StartTime') || 0.25;

        this.elapsed += ctx.delta;
        const timeOfDay = (startTime + (this.elapsed / duration)) % 1.0;
        const sunAngle = timeOfDay * Math.PI * 2; // 0→2π full rotation

        // Sun position: orbits in a semicircle
        const sunX = Math.cos(sunAngle) * 100;
        const sunY = Math.sin(sunAngle) * 100;
        const sunZ = 50;
        const isNight = sunY < -10;

        // Find skybox and update uniforms
        const skyObj = ctx.engine.objects.find((o: any) => o.type === 'Skybox');
        if (skyObj) {
            const mat = (skyObj.object as THREE.Mesh).material as THREE.ShaderMaterial;
            if (mat?.uniforms) {
                mat.uniforms.uSunPosition.value.set(sunX, sunY, sunZ);
                mat.uniforms.uTime.value = this.elapsed;

                // Dynamic sky color based on time of day
                const sunHeight = Math.sin(sunAngle); // -1 to 1

                if (sunHeight > 0.3) {
                    // Full day
                    mat.uniforms.uZenithColor.value.setHex(0x1e6091);
                    mat.uniforms.uHorizonColor.value.setHex(0x87ceeb);
                    mat.uniforms.uSunIntensity.value = 1.2;
                } else if (sunHeight > 0) {
                    // Golden hour (sunrise/sunset)
                    const t = sunHeight / 0.3;
                    mat.uniforms.uZenithColor.value.lerpColors(
                        new THREE.Color(0x0a1628), new THREE.Color(0x1e6091), t
                    );
                    mat.uniforms.uHorizonColor.value.lerpColors(
                        new THREE.Color(0xff6b35), new THREE.Color(0x87ceeb), t
                    );
                    mat.uniforms.uSunColor.value.lerpColors(
                        new THREE.Color(0xff4500), new THREE.Color(0xffeedd), t
                    );
                    mat.uniforms.uSunIntensity.value = 0.8 + t * 0.4;
                } else if (sunHeight > -0.3) {
                    // Twilight
                    const t = (sunHeight + 0.3) / 0.3;
                    mat.uniforms.uZenithColor.value.lerpColors(
                        new THREE.Color(0x020210), new THREE.Color(0x0a1628), t
                    );
                    mat.uniforms.uHorizonColor.value.lerpColors(
                        new THREE.Color(0x0d1117), new THREE.Color(0xff6b35), t
                    );
                    mat.uniforms.uSunIntensity.value = t * 0.8;
                } else {
                    // Night
                    mat.uniforms.uZenithColor.value.setHex(0x020210);
                    mat.uniforms.uHorizonColor.value.setHex(0x0d1117);
                    mat.uniforms.uNadirColor.value.setHex(0x010108);
                    mat.uniforms.uSunIntensity.value = 0;
                }
            }
        }

        // Update directional light if present
        const sunLight = ctx.engine.scene.children.find(
            (c: any) => c instanceof THREE.DirectionalLight
        );
        if (sunLight) {
            (sunLight as THREE.DirectionalLight).position.set(sunX, Math.max(sunY, 0.1), sunZ);
            (sunLight as THREE.DirectionalLight).intensity = isNight ? 0.1 : 1.0;
        }

        this.setOutput('TimeOfDay', timeOfDay);
        this.setOutput('IsNight', isNight);
        this.setOutput('SunAngle', sunAngle);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'DayNightCycleNode', label: 'Day/Night Cycle', category: 'Event', color: '#e63946', description: 'Automatic sun orbit with sky color transitions', icon: '🌅' };
    }

    toJSON() { return { ...super.toJSON(), type: 'DayNightCycleNode' }; }
    static fromJSON(data: any): DayNightCycleNode {
        const n = new DayNightCycleNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SetSunNode: Manually position the sun and control its appearance.
 */
export class SetSunNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Position', 'vector3', { x: 100, y: 60, z: 50 }),
            dataIn(this.id, 'Color', 'number', 0xffeedd),
            dataIn(this.id, 'Intensity', 'number', 1.0),
            dataIn(this.id, 'Size', 'number', 3.0)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'SetSunNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const skyObj = ctx.engine.objects.find((o: any) => o.type === 'Skybox');
        if (!skyObj) return;

        const mat = (skyObj.object as THREE.Mesh).material as THREE.ShaderMaterial;
        if (!mat?.uniforms) return;

        const pos = this.getInput('Position') || { x: 100, y: 60, z: 50 };
        mat.uniforms.uSunPosition.value.set(pos.x, pos.y, pos.z);
        mat.uniforms.uSunColor.value.setHex(this.getInput('Color') ?? 0xffeedd);
        mat.uniforms.uSunIntensity.value = this.getInput('Intensity') ?? 1.0;
        mat.uniforms.uSunSize.value = this.getInput('Size') ?? 3.0;
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SetSunNode', label: 'Set Sun', category: 'Action', color: '#1d3557', description: 'Control sun position, color, and intensity', icon: '☀️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SetSunNode' }; }
    static fromJSON(data: any): SetSunNode {
        const n = new SetSunNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * WeatherNode: Shift sky atmosphere and fog to simulate weather states.
 */
export type WeatherPreset = 'Clear' | 'Cloudy' | 'Overcast' | 'Storm' | 'Fog' | 'Sunset';

const WEATHER_PRESETS: Record<WeatherPreset, { zenith: number, horizon: number, atmosphere: number, fog: number, fogColor: number }> = {
    'Clear':    { zenith: 0x1e6091, horizon: 0x87ceeb,  atmosphere: 0.8, fog: 0,    fogColor: 0x87ceeb },
    'Cloudy':   { zenith: 0x3d5a80, horizon: 0x98c1d9,  atmosphere: 0.4, fog: 0,    fogColor: 0x98c1d9 },
    'Overcast': { zenith: 0x4a4a5a, horizon: 0x8a8a9a,  atmosphere: 0.3, fog: 0.01, fogColor: 0x8a8a9a },
    'Storm':    { zenith: 0x1a1a2e, horizon: 0x3a3a4e,  atmosphere: 0.2, fog: 0.02, fogColor: 0x2a2a3e },
    'Fog':      { zenith: 0x6a6a7a, horizon: 0x9a9aaa,  atmosphere: 0.1, fog: 0.05, fogColor: 0x9a9aaa },
    'Sunset':   { zenith: 0x1a0a3a, horizon: 0xff6b35,  atmosphere: 0.6, fog: 0,    fogColor: 0xff6b35 }
};

export class WeatherNode extends LogicNode {
    private currentPreset: WeatherPreset = 'Clear';
    private transitionProgress = 1;

    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Preset', 'string', 'Clear'),
            dataIn(this.id, 'TransitionSpeed', 'number', 1.0)
        ];
        this.outputs = [
            execOut(this.id, 'Out'),
            dataOut(this.id, 'CurrentWeather', 'string')
        ];
    }

    getTypeName() { return 'WeatherNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const preset = (this.getInput('Preset') || 'Clear') as WeatherPreset;
        const speed = this.getInput('TransitionSpeed') || 1.0;
        const weather = WEATHER_PRESETS[preset] || WEATHER_PRESETS['Clear'];

        if (preset !== this.currentPreset) {
            this.currentPreset = preset;
            this.transitionProgress = 0;
        }

        this.transitionProgress = Math.min(1, this.transitionProgress + ctx.delta * speed);
        const t = this.transitionProgress;

        const skyObj = ctx.engine.objects.find((o: any) => o.type === 'Skybox');
        if (skyObj) {
            const mat = (skyObj.object as THREE.Mesh).material as THREE.ShaderMaterial;
            if (mat?.uniforms) {
                mat.uniforms.uZenithColor.value.lerp(new THREE.Color(weather.zenith), t * 0.1);
                mat.uniforms.uHorizonColor.value.lerp(new THREE.Color(weather.horizon), t * 0.1);
                mat.uniforms.uAtmosphere.value += (weather.atmosphere - mat.uniforms.uAtmosphere.value) * t * 0.1;
            }
        }

        // Scene fog
        if (weather.fog > 0) {
            ctx.engine.scene.fog = new THREE.FogExp2(weather.fogColor, weather.fog);
        } else if (ctx.engine.scene.fog) {
            ctx.engine.scene.fog = null;
        }

        this.setOutput('CurrentWeather', preset);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'WeatherNode', label: 'Weather', category: 'Action', color: '#1d3557', description: 'Transition between weather presets', icon: '⛈️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'WeatherNode' }; }
    static fromJSON(data: any): WeatherNode {
        const n = new WeatherNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * StarFieldNode: Control the star intensity and visibility threshold.
 */
export class StarFieldNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Intensity', 'number', 1.0),
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'StarFieldNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const skyObj = ctx.engine.objects.find((o: any) => o.type === 'Skybox');
        if (!skyObj) return;

        const mat = (skyObj.object as THREE.Mesh).material as THREE.ShaderMaterial;
        if (!mat?.uniforms) return;

        mat.uniforms.uStarIntensity.value = this.getInput('Intensity') ?? 1.0;
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'StarFieldNode', label: 'Star Field', category: 'Action', color: '#1d3557', description: 'Control star visibility and intensity', icon: '✨' };
    }

    toJSON() { return { ...super.toJSON(), type: 'StarFieldNode' }; }
    static fromJSON(data: any): StarFieldNode {
        const n = new StarFieldNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}
