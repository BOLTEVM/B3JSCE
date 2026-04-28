import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

global.self = global;
global.document = {
    createElement: () => ({ setAttribute: () => {}, style: {} }),
};
global.window = { URL: { createObjectURL: () => '', revokeObjectURL: () => {} } };

const loader = new GLTFLoader();

const files = fs.readdirSync('./assets/models').filter(f => f.endsWith('.glb'));

for (const file of files) {
    console.log(`\nChecking ${file}...`);
    const buffer = fs.readFileSync(`./assets/models/${file}`);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    loader.parse(arrayBuffer, '', (gltf) => {
        gltf.scene.traverse(child => {
            let pos = new THREE.Vector3();
            child.getWorldPosition(pos);
            if (file === 'bolt-engine.glb' && child.name.toLowerCase().includes('snap')) {
                console.log(`- ${file} -> ${child.name} pos: ${pos.toArray().map(n => n.toFixed(2)).join(', ')}`);
            }
        });
    }, (e) => console.error(e));
}
