# GLB Hyperfy-Compatible Parser

- Added glbParser.ts: processGlbPhysics extracts collider/rigidbody/mesh/lod/snap nodes from GLB userData (Hyperfy format)
- Updated templates.ts: BoltEVM models now load with full physics (colliders create CANNON.Trimesh/ConvexPolyhedron, rigidbodies create CANNON.Body)
- Updated index.ts: handleFilesDrop now processes GLB physics; export glbParser module
- Collider meshes auto-hidden from rendering
