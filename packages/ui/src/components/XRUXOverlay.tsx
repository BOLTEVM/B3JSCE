/** @jsx webjsx.h */
import * as webjsx from 'webjsx';
import * as THREE from 'three';

type TabId = 'worlds' | 'inventory' | 'preferences' | 'permissions';

let isExpanded = true;
let activeTab: TabId = 'worlds';

const getPref = (key: string, fallback: string) => localStorage.getItem(key) || fallback;
const setPref = (key: string, value: string, onRender?: () => void) => {
    localStorage.setItem(key, value);
    onRender && onRender();
};

export const XRUXOverlay = ({ engine, selectedObject, onRender, onOpenSettings }: any) => {
    const scenes = Array.from(engine?.sceneRegistry?.keys?.() || []);
    const projects = engine?.projects?.list?.() || [];
    const inventory = selectedObject?.inventory;
    const items = inventory?.items || [];
    const opacity = getPref('B3JS_XR_UI_OPACITY', '0.78');
    const locomotion = getPref('B3JS_XR_LOCOMOTION', 'Teleport');
    const hand = getPref('B3JS_XR_SETTINGS_HAND', getPref('B3JS_XR_DOMINANT_HAND', 'left'));
    const comfort = getPref('B3JS_XR_COMFORT', 'balanced');
    const density = getPref('B3JS_XR_UI_DENSITY', 'comfortable');
    const accessMode = getPref('B3JS_WORLD_ACCESS_MODE', 'private');
    const editPolicy = getPref('B3JS_WORLD_EDIT_POLICY', 'owner');
    const invitePolicy = getPref('B3JS_WORLD_INVITE_POLICY', 'invite');

    const rerender = () => onRender && onRender();

    const setLocomotion = (mode: string) => {
        setPref('B3JS_XR_LOCOMOTION', mode, onRender);
        engine?.xr?.setMode?.(mode);
    };

    const setSettingsHand = (value: string) => {
        const handValue = value === 'right' ? 'right' : 'left';
        setPref('B3JS_XR_SETTINGS_HAND', handValue);
        setPref('B3JS_XR_DOMINANT_HAND', handValue);
        engine?.xr?.setSettingsMenuHand?.(handValue);
        rerender();
    };

    const switchScene = (name: string) => {
        engine?.switchScene(name);
        rerender();
    };

    const createScene = () => {
        const name = prompt('Scene name:', `World ${scenes.length + 1}`);
        if (!name) return;
        engine?.createNewScene(name);
        rerender();
    };

    const deleteActiveScene = () => {
        if (!engine || scenes.length <= 1) return;
        if (confirm(`Delete ${engine.activeSceneName}?`)) {
            engine.deleteScene(engine.activeSceneName);
            rerender();
        }
    };

    const saveWorld = () => {
        if (!engine) return;
        const name = prompt('Save world as:', engine.activeSceneName || 'B3JS World');
        if (!name) return;
        engine.activeProjectId = engine.projects.save(name, engine.serialize(), engine.activeProjectId || undefined);
        rerender();
    };

    const loadProject = (id: string) => {
        const data = engine?.projects?.load(id);
        if (!data) return;
        engine.deserialize(data);
        engine.activeProjectId = id;
        rerender();
    };

    const equipOrUnequip = (item: any) => {
        if (!selectedObject || !inventory || !item.slot) return;
        const equipped = Array.from(inventory.equipped.values()).some((i: any) => i.id === item.id);
        if (equipped) selectedObject.unequipItem(item.slot);
        else selectedObject.equipItem(item);
        rerender();
    };

    const dropItem = (item: any) => {
        if (!inventory || !item.id) return;
        inventory.removeItem(item.id, 1);
        rerender();
    };

    const getUserSpawnPosition = () => {
        const origin = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1);
        const camera = engine?.camera;

        if (camera) {
            camera.getWorldPosition(origin);
            camera.getWorldDirection(forward);
        } else if (engine?.xrRig) {
            engine.xrRig.getWorldPosition(origin);
            engine.xrRig.getWorldDirection(forward);
        }

        forward.y = 0;
        if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
        forward.normalize();

        const distance = engine?.renderer?.xr?.isPresenting ? 1.35 : 2.2;
        return origin.add(forward.multiplyScalar(distance)).add(new THREE.Vector3(0, -0.25, 0));
    };

    const placeSpawnedObject = (obj: any, item: any, position: THREE.Vector3) => {
        if (!obj?.object) return;
        obj.object.position.copy(position);
        obj.name = item.name || obj.name;
        obj.metadata = {
            ...(obj.metadata || {}),
            inventorySpawn: true,
            sourceItemId: item.id,
            sourceCategory: item.category,
            itemStats: item.stats || {}
        };
        if (item.modelUrl && item.modelUrl !== 'default') obj.modelUrl = item.modelUrl;
        if (obj.body) {
            obj.body.position.copy(position as any);
            obj.body.velocity?.set?.(0, 0, 0);
            obj.body.angularVelocity?.set?.(0, 0, 0);
        }
        engine?.selectObject?.(obj.id);
    };

    const spawnInventoryItem = async (item: any) => {
        if (!engine || !inventory) return;
        const position = getUserSpawnPosition();
        const assetId = item.metadata?.assetId || item.metadata?.assetBankId;

        if (assetId && engine.spawnAsset) {
            const spawned = await engine.spawnAsset(assetId, position);
            placeSpawnedObject(spawned, item, position);
        } else {
            let spawned: any = null;
            if (item.category === 'Ammo') spawned = engine.createAmmoPickup?.(item.name || 'Ammo Pickup');
            else if (item.category === 'Consumable') spawned = engine.createHealthPickup?.(item.name || 'Consumable Pickup');
            else if (item.category === 'Weapon') spawned = engine.createWeaponUnit?.(item.name || 'Weapon Pickup');
            else spawned = engine.createCube?.(item.name || 'Inventory Item');
            placeSpawnedObject(spawned, item, position);
        }

        if (item.id) inventory.removeItem(item.id, 1);
        rerender();
    };

    const createGlobalWorld = () => {
        const name = prompt('Global world name:', engine?.activeSceneName || 'B3JS World');
        if (!name) return;
        engine?.spacetime?.createLobby?.(name, accessMode === 'public');
        rerender();
    };

    const joinPrivateWorld = () => {
        const id = prompt('World ID:');
        if (!id) return;
        engine?.spacetime?.joinLobby?.(id);
        rerender();
    };

    const shareWorldId = () => {
        const id = engine?.spacetime?.activeLobbyId;
        if (id) prompt('Copy World ID:', id);
        else alert('Not connected to a shared world.');
    };

    const tab = (id: TabId, label: string) => (
        <button class={`xrux-tab ${activeTab === id ? 'active' : ''}`} onClick={() => { activeTab = id; rerender(); }}>
            {label}
        </button>
    );

    if (!isExpanded) {
        return (
            <div class={`xrux-layer ${hand === 'left' ? 'left-hand' : 'right-hand'}`}>
                <button class="xrux-launcher" title="Open XR command panel" onClick={() => { isExpanded = true; rerender(); }}>XR</button>
            </div>
        );
    }

    return (
        <div class={`xrux-layer ${hand === 'left' ? 'left-hand' : 'right-hand'}`}>
            <div class={`xrux-panel ${hand === 'left' ? 'left-hand' : 'right-hand'}`} style={`--xrux-opacity: ${opacity};`}>
                <div class="xrux-header">
                    <div>
                        <div class="xrux-title">XR Command</div>
                        <div class="xrux-subtitle">{engine?.activeSceneName || 'No world loaded'}</div>
                    </div>
                    <div class="xrux-header-actions">
                        <button class="xrux-icon-btn" onClick={onOpenSettings}>SET</button>
                        <button class="xrux-icon-btn" onClick={() => { isExpanded = false; rerender(); }}>MIN</button>
                    </div>
                </div>

                <div class="xrux-tabs">
                    {tab('worlds', 'Worlds')}
                    {tab('inventory', 'Inventory')}
                    {tab('permissions', 'Access')}
                    {tab('preferences', 'Prefs')}
                </div>

                <div class="xrux-body">
                    {activeTab === 'worlds' && (
                        <div class="xrux-section">
                            <div class="xrux-section-head"><span>Scene Registry</span><button class="xrux-soft-btn" onClick={createScene}>New</button></div>
                            <div class="xrux-list">
                                {scenes.map((name: string) => (
                                    <button class={`xrux-row ${engine?.activeSceneName === name ? 'selected' : ''}`} onClick={() => switchScene(name)}>
                                        <span>{name}</span><span>{engine?.activeSceneName === name ? 'Active' : 'Open'}</span>
                                    </button>
                                ))}
                            </div>
                            <div class="xrux-actions">
                                <button class="xrux-soft-btn" onClick={saveWorld}>Save World</button>
                                <button class="xrux-soft-btn danger" onClick={deleteActiveScene}>Delete Scene</button>
                            </div>
                            <div class="xrux-section-head project-head"><span>Saved Worlds</span><span>{projects.length}</span></div>
                            <div class="xrux-list compact">
                                {projects.length === 0 && <div class="xrux-empty">No saved worlds yet.</div>}
                                {projects.map((p: any) => (
                                    <button class={`xrux-row ${engine?.activeProjectId === p.id ? 'selected' : ''}`} onClick={() => loadProject(p.id)}>
                                        <span>{p.name}</span><span>{new Date(p.lastModified).toLocaleDateString()}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <div class="xrux-section">
                            <div class="xrux-section-head">
                                <span>{selectedObject ? selectedObject.name : 'No object selected'}</span>
                                {inventory && <span>{inventory.getTotalWeight().toFixed(1)} / {inventory.maxWeight} kg</span>}
                            </div>
                            {!inventory && <div class="xrux-empty">Select an object with inventory to manage items.</div>}
                            {inventory && <div class={`xrux-inventory ${density}`}>
                                {items.length === 0 && <div class="xrux-empty">Inventory is empty.</div>}
                                {items.map((item: any) => {
                                    const equipped = Array.from(inventory.equipped.values()).some((i: any) => i.id === item.id);
                                    return (
                                        <div class={`xrux-item ${equipped ? 'equipped' : ''}`}>
                                            <div class="xrux-item-top"><strong>{item.name}</strong><span>{item.quantity > 1 ? `x${item.quantity}` : item.category}</span></div>
                                            <div class="xrux-item-meta"><span>{item.weight} kg</span>{equipped && <span>Equipped</span>}</div>
                                            <div class="xrux-item-actions">
                                                {(item.category === 'Weapon' || item.category === 'Armor') && <button class="xrux-soft-btn" onClick={() => equipOrUnequip(item)}>{equipped ? 'Unequip' : 'Equip'}</button>}
                                                <button class="xrux-soft-btn" onClick={() => spawnInventoryItem(item)}>Spawn</button>
                                                <button class="xrux-soft-btn danger" onClick={() => dropItem(item)}>Drop</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>}
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div class="xrux-section">
                            <label class="xrux-field"><span>World visibility</span><select value={accessMode} onChange={(e: any) => setPref('B3JS_WORLD_ACCESS_MODE', e.target.value, onRender)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
                            <label class="xrux-field"><span>Edit access</span><select value={editPolicy} onChange={(e: any) => setPref('B3JS_WORLD_EDIT_POLICY', e.target.value, onRender)}><option value="owner">Owner only</option><option value="trusted">Trusted users</option><option value="members">World members</option></select></label>
                            <label class="xrux-field"><span>Invite policy</span><select value={invitePolicy} onChange={(e: any) => setPref('B3JS_WORLD_INVITE_POLICY', e.target.value, onRender)}><option value="invite">Invite only</option><option value="link">Anyone with link</option><option value="open">Open join</option></select></label>
                            <label class="xrux-toggle"><input type="checkbox" checked={engine?.allowPlayerVoiceAI} onChange={(e: any) => { if (engine) engine.allowPlayerVoiceAI = e.target.checked; rerender(); }} /><span>Allow player voice AI</span></label>
                            <label class="xrux-toggle"><input type="checkbox" checked={engine?.isAdmin} onChange={(e: any) => { if (engine) engine.isAdmin = e.target.checked; rerender(); }} /><span>Admin editing session</span></label>
                            <div class="xrux-actions">
                                <button class="xrux-soft-btn" onClick={createGlobalWorld}>Create Shared World</button>
                                <button class="xrux-soft-btn" onClick={joinPrivateWorld}>Join Private</button>
                                <button class="xrux-soft-btn" onClick={shareWorldId}>Share ID</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'preferences' && (
                        <div class="xrux-section">
                            <label class="xrux-field"><span>Locomotion</span><select value={locomotion} onChange={(e: any) => setLocomotion(e.target.value)}><option value="Teleport">Teleport</option><option value="Fly">Fly</option><option value="Designer">Designer</option><option value="Teleoperation">Teleoperation</option></select></label>
                            <label class="xrux-field"><span>Comfort</span><select value={comfort} onChange={(e: any) => setPref('B3JS_XR_COMFORT', e.target.value, onRender)}><option value="stable">Stable</option><option value="balanced">Balanced</option><option value="immersive">Immersive</option></select></label>
                            <label class="xrux-field"><span>Settings hand</span><select value={hand} onChange={(e: any) => setSettingsHand(e.target.value)}><option value="left">Left</option><option value="right">Right</option></select></label>
                            <label class="xrux-field"><span>UI density</span><select value={density} onChange={(e: any) => setPref('B3JS_XR_UI_DENSITY', e.target.value, onRender)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
                            <label class="xrux-field"><span>Glass opacity</span><input type="range" min="0.45" max="0.95" step="0.01" value={opacity} onInput={(e: any) => setPref('B3JS_XR_UI_OPACITY', e.target.value, onRender)} /></label>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
