import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

global.self = global;
global.document = {
    createElement: () => ({ setAttribute: () => {}, style: {} }),
};
global.window = { 
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    navigator: { userAgent: 'node' }
};

const loader = new GLTFLoader();

const filePath = './assets/models/bolt-base-t3.glb';
if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

loader.parse(arrayBuffer, '', (gltf) => {
    console.log("Traversing scene for SnapPoint.033...");
    gltf.scene.traverse(child => {
        if (child.name.includes('SnapPoint.033')) {
            let pos = new THREE.Vector3();
            child.getWorldPosition(pos);
            console.log(`FOUND ${child.name} at: ${pos.x}, ${pos.y}, ${pos.z}`);
        }
    });
}, (e) => console.error(e));
