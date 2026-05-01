import * as THREE from 'three';
import { nanoid } from 'nanoid';

export type ShaderContext = 'vertex' | 'fragment';
export type ShaderValueType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color';

export interface ShaderNodePin {
    name: string;
    type: ShaderValueType;
}

/**
 * Base Shader Node
 */
export abstract class ShaderNode {
    id: string = nanoid();
    guiMetadata: { x: number, y: number } = { x: 100, y: 100 };
    
    inputs: Map<string, { nodeId: string, outputName: string }> = new Map();

    abstract getTypeName(): string;
    abstract getOutputPins(): ShaderNodePin[];
    abstract getInputPins(): ShaderNodePin[];
    
    /**
     * Generates GLSL code for this node.
     * @param context 'vertex' or 'fragment'
     * @param generator The generator instance for recursion and variable registry
     */
    abstract generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string;

    toJSON(): any {
        return {
            id: this.id,
            type: this.getTypeName(),
            guiMetadata: this.guiMetadata,
            inputs: Array.from(this.inputs.entries())
        };
    }
}

/**
 * Concrete Nodes
 */

export class ColorNode extends ShaderNode {
    constructor(public color: THREE.Color = new THREE.Color(1, 1, 1)) { super(); }
    getTypeName() { return 'ColorNode'; }
    getInputPins(): ShaderNodePin[] { return []; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'color', type: 'vec3' }]; }

    static fromJSON(data: any): ColorNode {
        const node = new ColorNode(new THREE.Color(data.color.r, data.color.g, data.color.b));
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        const varName = generator.getVariableName(this, 'color');
        generator.addMainBody(`vec3 ${varName} = vec3(${this.color.r}, ${this.color.g}, ${this.color.b});`);
        return varName;
    }

    static getNodeInfo() {
        return { label: 'Color', category: 'Input', icon: '🎨', color: '#6366f1', description: 'Constant RGB color input' };
    }
}

export class PositionNode extends ShaderNode {
    getTypeName() { return 'PositionNode'; }
    getInputPins(): ShaderNodePin[] { return []; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'pos', type: 'vec3' }]; }

    static fromJSON(data: any): PositionNode {
        const node = new PositionNode();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        if (context === 'vertex') return 'position';
        return 'vPosition'; // Assumes vertex shader passes vPosition
    }

    static getNodeInfo() {
        return { label: 'Position', category: 'Geometry', icon: '📍', color: '#6366f1', description: 'Vertex/Fragment world position' };
    }
}

export class TimeNode extends ShaderNode {
    getTypeName() { return 'TimeNode'; }
    getInputPins(): ShaderNodePin[] { return []; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'time', type: 'float' }]; }

    static fromJSON(data: any): TimeNode {
        const node = new TimeNode();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        generator.addUniform('uTime', 'float');
        return 'uTime';
    }

    static getNodeInfo() {
        return { label: 'Time', category: 'Input', icon: '🕒', color: '#6366f1', description: 'Engine elapsed time in seconds' };
    }
}

export class MathNode extends ShaderNode {
    constructor(public operation: 'add' | 'multiply' | 'sin' = 'add') { super(); }
    getTypeName() { return 'MathNode'; }
    getInputPins(): ShaderNodePin[] { 
        if (this.operation === 'sin') return [{ name: 'v', type: 'float' }];
        return [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }]; 
    }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'result', type: 'float' }]; }
    
    static fromJSON(data: any): MathNode {
        const node = new MathNode(data.operation);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        const outVar = generator.getVariableName(this, 'res');
        
        if (this.operation === 'sin') {
            const v = generator.getNodeOutput(this.inputs.get('v')!, context);
            generator.addMainBody(`float ${outVar} = sin(${v});`);
        } else {
            const a = generator.getNodeOutput(this.inputs.get('a')!, context);
            const b = generator.getNodeOutput(this.inputs.get('b')!, context);
            const op = this.operation === 'add' ? '+' : '*';
            generator.addMainBody(`float ${outVar} = ${a} ${op} ${b};`);
        }
        
        return outVar;
    }

    static getNodeInfo() {
        return { label: 'Math', category: 'Converter', icon: '➕', color: '#06b6d4', description: 'Basic arithmetic operations' };
    }
}

export class AudioNode extends ShaderNode {
    constructor(public freqIndex: number = 0) { super(); }
    getTypeName() { return 'AudioNode'; }
    getInputPins(): ShaderNodePin[] { return []; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'amp', type: 'float' }]; }

    static fromJSON(data: any): AudioNode {
        const node = new AudioNode(data.freqIndex);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        // We inject a global audio data uniform (spectrum)
        generator.addUniform('uAudioData[128]', 'float');
        const idx = Math.max(0, Math.min(127, Math.floor(this.freqIndex)));
        return `uAudioData[${idx}] / 255.0`;
    }

    static getNodeInfo() {
        return { label: 'Audio', category: 'Input', icon: '🔊', color: '#6366f1', description: 'FFT audio spectrum data' };
    }
}

/**
 * NoiseNode: Procedural Simplex Noise
 */
export class NoiseNode extends ShaderNode {
    constructor(public scale: number = 1.0) { super(); }
    getTypeName() { return 'NoiseNode'; }
    getInputPins(): ShaderNodePin[] { return [{ name: 'pos', type: 'vec3' }, { name: 'scale', type: 'float' }]; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'noise', type: 'float' }]; }

    static fromJSON(data: any): NoiseNode {
        const node = new NoiseNode(data.scale || 1.0);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        // Inject Noise functions (Classic Perlin/Simplex)
        generator.addFunction('noise', `
            float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
            vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
            vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
            float snoise(vec3 v){ 
              const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
              const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
              vec3 i  = floor(v + dot(v, C.yyy) );
              vec3 x0 =   v - i + dot(i, C.xxx) ;
              vec3 g = step(x0.yzx, x0.xyz);
              vec3 l = 1.0 - g;
              vec3 i1 = min( g.xyz, l.zxy );
              vec3 i2 = max( g.xyz, l.zxy );
              vec3 x1 = x0 - i1 + C.xxx;
              vec3 x2 = x0 - i2 + C.yyy;
              vec3 x3 = x0 - D.yyy;
              i = mod289(i); 
              vec4 p = permute( permute( permute( 
                         i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                       + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                       + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
              float n_ = 0.142857142857; 
              vec3  ns = n_ * D.wyz - D.xzx;
              vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  
              vec4 x_ = floor(j * ns.z);
              vec4 y_ = floor(j - 7.0 * x_ );    
              vec4 x = x_ *ns.x + ns.yyyy;
              vec4 y = y_ *ns.x + ns.yyyy;
              vec4 h = 1.0 - abs(x) - abs(y);
              vec4 b0 = vec4( x.xy, y.xy );
              vec4 b1 = vec4( x.zw, y.zw );
              vec4 s0 = floor(b0)*2.0 + 1.0;
              vec4 s1 = floor(b1)*2.0 + 1.0;
              vec4 sh = -step(h, vec4(0.0));
              vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
              vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
              vec3 p0 = vec3(a0.xy,h.x);
              vec3 p1 = vec3(a0.zw,h.y);
              vec3 p2 = vec3(a1.xy,h.z);
              vec3 p3 = vec3(a1.zw,h.w);
              vec4 norm = 1.79284291400159 - 0.85373472095314 * 
                vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3));
              p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
              vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
              m = m * m;
              return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                            dot(p2,x2), dot(p3,x3) ) );
            }
        `);

        const varName = generator.getVariableName(this, 'noise');
        const posInput = this.inputs.has('pos') ? generator.getNodeOutput(this.inputs.get('pos')!, context) : 'vPosition';
        const scaleInput = this.inputs.has('scale') ? generator.getNodeOutput(this.inputs.get('scale')!, context) : `${this.scale.toFixed(4)}`;
        
        generator.addMainBody(`float ${varName} = snoise(${posInput} * ${scaleInput});`);
        return varName;
    }

    static getNodeInfo() {
        return { label: 'Noise', category: 'Texture', icon: '☁️', color: '#f97316', description: '3D Simplex noise generator' };
    }
}

/**
 * MixNode: Linear Interpolation
 */
export class MixNode extends ShaderNode {
    getTypeName() { return 'MixNode'; }
    getInputPins(): ShaderNodePin[] { return [{ name: 'a', type: 'vec3' }, { name: 'b', type: 'vec3' }, { name: 't', type: 'float' }]; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'out', type: 'vec3' }]; }

    static fromJSON(data: any): MixNode {
        const node = new MixNode();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        const varName = generator.getVariableName(this, 'mix');
        const a = this.inputs.has('a') ? generator.getNodeOutput(this.inputs.get('a')!, context) : 'vec3(0.0)';
        const b = this.inputs.has('b') ? generator.getNodeOutput(this.inputs.get('b')!, context) : 'vec3(1.0)';
        const t = this.inputs.has('t') ? generator.getNodeOutput(this.inputs.get('t')!, context) : '0.5';
        
        generator.addMainBody(`vec3 ${varName} = mix(${a}, ${b}, ${t});`);
        return varName;
    }

    static getNodeInfo() {
        return { label: 'Mix', category: 'Converter', icon: '🌓', color: '#06b6d4', description: 'Linear interpolation between two inputs' };
    }
}

/**
 * Vector3Node: Compose From Floats
 */
export class Vector3Node extends ShaderNode {
    getTypeName() { return 'Vector3Node'; }
    getOutputPins(): ShaderNodePin[] { return [{ name: 'vec', type: 'vec3' }]; }
    getInputPins(): ShaderNodePin[] { return [{ name: 'x', type: 'float' }, { name: 'y', type: 'float' }, { name: 'z', type: 'float' }]; }

    static fromJSON(data: any): Vector3Node {
        const node = new Vector3Node();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        const varName = generator.getVariableName(this, 'vec');
        const x = this.inputs.has('x') ? generator.getNodeOutput(this.inputs.get('x')!, context) : '0.0';
        const y = this.inputs.has('y') ? generator.getNodeOutput(this.inputs.get('y')!, context) : '0.0';
        const z = this.inputs.has('z') ? generator.getNodeOutput(this.inputs.get('z')!, context) : '0.0';
        
        generator.addMainBody(`vec3 ${varName} = vec3(${x}, ${y}, ${z});`);
        return varName;
    }

    static getNodeInfo() {
        return { label: 'Vector3', category: 'Converter', icon: '🧱', color: '#06b6d4', description: 'Compose a vector from floats' };
    }
}

export class OutputNode extends ShaderNode {
    getTypeName() { return 'OutputNode'; }
    getOutputPins(): ShaderNodePin[] { return []; }
    getInputPins(): ShaderNodePin[] { return [
        { name: 'diffuse', type: 'vec3' },
        { name: 'opacity', type: 'float' },
        { name: 'offset', type: 'vec3' }
    ]; }

    static fromJSON(data: any): OutputNode {
        const node = new OutputNode();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.inputs = new Map(data.inputs);
        return node;
    }

    generateCode(context: ShaderContext, generator: ShaderMaterialGenerator): string {
        if (context === 'fragment') {
            const diffuse = this.inputs.has('diffuse') 
                ? generator.getNodeOutput(this.inputs.get('diffuse')!, context)
                : 'vec3(1.0)';
            const opacity = this.inputs.has('opacity')
                ? generator.getNodeOutput(this.inputs.get('opacity')!, context)
                : '1.0';
            generator.addMainBody(`gl_FragColor = vec4(${diffuse}, ${opacity});`);
        } else {
            const offset = this.inputs.has('offset')
                ? generator.getNodeOutput(this.inputs.get('offset')!, context)
                : 'vec3(0.0)';
            generator.addMainBody(`gl_Position = projectionMatrix * modelViewMatrix * vec4(position + ${offset}, 1.0);`);
            generator.addVarying('vPosition', 'vec3', 'position');
        }
        return '';
    }

    static getNodeInfo() {
        return { label: 'Material Output', category: 'Output', icon: '🎯', color: '#ef4444', description: 'Final shader output' };
    }
}

/**
 * Uniform Manager for user parameters
 */
export class UniformManager {
    uniforms: { [key: string]: { type: string, value: any } } = {};

    set(name: string, type: string, value: any) {
        this.uniforms[name] = { type, value };
    }

    getThreeUniforms() {
        const u: any = {};
        for (const [name, data] of Object.entries(this.uniforms)) {
            u[name] = { value: data.value };
        }
        return u;
    }
}

/**
 * GLSL Generator
 */
export class ShaderMaterialGenerator {
    private uniforms: Set<string> = new Set();
    private functions: Map<string, string> = new Map();
    private varyings: Map<string, { type: string, value: string }> = new Map();
    private mainBody: string[] = [];
    private nodeVarMap: Map<string, string> = new Map();
    private allNodes: Map<string, ShaderNode> = new Map();
    private nameCache: Map<string, string> = new Map();
    private nameCounter: number = 0;

    constructor(nodes: ShaderNode[]) {
        nodes.forEach(n => this.allNodes.set(n.id, n));
    }

    addUniform(name: string, type: string) {
        this.uniforms.add(`uniform ${type} ${name};`);
    }

    addFunction(name: string, body: string) {
        this.functions.set(name, body);
    }

    addVarying(name: string, type: string, value: string) {
        this.varyings.set(name, { type, value });
    }

    addMainBody(line: string) {
        this.mainBody.push(line);
    }

    getVariableName(node: ShaderNode, suffix: string) {
        const idKey = `${node.id}_${suffix}`;
        if (this.nameCache.has(idKey)) return this.nameCache.get(idKey)!;

        this.nameCounter++;
        const varName = `${node.getTypeName()}_${this.nameCounter}_${suffix}`;
        this.nameCache.set(idKey, varName);
        return varName;
    }

    getNodeOutput(input: { nodeId: string, outputName: string }, context: ShaderContext): string {
        const node = this.allNodes.get(input.nodeId);
        if (!node) return '0.0';
        
        const key = `${context}_${node.id}_${input.outputName}`;
        if (this.nodeVarMap.has(key)) return this.nodeVarMap.get(key)!;

        const result = node.generateCode(context, this);
        this.nodeVarMap.set(key, result);
        return result;
    }

    generate(context: ShaderContext): string {
        this.mainBody = [];
        this.nodeVarMap.clear();
        this.nameCache.clear();
        this.nameCounter = 0;

        // GLSL Type Checking Pass (Issue #20)
        let hasTypeErrors = false;
        this.allNodes.forEach((node) => {
            const inputPins = node.getInputPins();
            node.inputs.forEach((conn, pinName) => {
                const targetNode = this.allNodes.get(conn.nodeId);
                const pinDef = inputPins.find(p => p.name === pinName);
                
                if (targetNode && pinDef) {
                    const outPin = targetNode.getOutputPins().find(p => p.name === conn.outputName);
                    if (outPin && outPin.type !== pinDef.type) {
                        console.error(`B3JS Shader Error: DataType Mismatch! [${node.getTypeName()}] wants '${pinName}' (${pinDef.type}), but is connected to [${targetNode.getTypeName()}] '${conn.outputName}' (${outPin.type}).`);
                        hasTypeErrors = true;
                    }
                }
            });
        });

        if (hasTypeErrors) {
            console.warn("B3JS: Aborting shader compilation due to strict type mismatches. Falling back to magenta error shader.");
            return context === 'vertex' 
                ? `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
                : `uniform vec3 diffuse; void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }`;
        }
        
        const outputNode = Array.from(this.allNodes.values()).find(n => n instanceof OutputNode);
        if (outputNode) {
            outputNode.generateCode(context, this);
        }

        const uniformLines = Array.from(this.uniforms).join('\n');
        const functionLines = Array.from(this.functions.values()).join('\n');
        const varyingLines = Array.from(this.varyings.entries())
            .map(([name, data]) => `varying ${data.type} ${name};`)
            .join('\n');
        
        const varyingAssigns = context === 'vertex' 
            ? Array.from(this.varyings.entries()).map(([name, data]) => `${name} = ${data.value};`).join('\n')
            : '';

        return `
            ${uniformLines}
            ${varyingLines}
            ${functionLines}
            void main() {
                ${varyingAssigns}
                ${this.mainBody.join('\n')}
            }
        `;
    }
}
