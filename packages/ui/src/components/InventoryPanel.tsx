/** @jsx webjsx.h */
import * as webjsx from 'webjsx';

export const InventoryPanel = ({ 
    selectedObject, 
    onRender 
}: any) => {
    if (!selectedObject || !selectedObject.inventory) {
        return (
            <div style="padding: 20px; text-align: center; opacity: 0.3;">
                Select an object to view inventory
            </div>
        );
    }

    const inventory = selectedObject.inventory;

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #0a0a0a; color: #fff;">
            <div style="padding: 10px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; font-weight: bold; color: #e68523;">Backpack</span>
                <div style="font-size: 10px; color: #666;">
                    Weight: {inventory.getTotalWeight().toFixed(1)} / {inventory.maxWeight} kg
                </div>
            </div>

            <div style="flex: 1; padding: 10px; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                    {inventory.items.map((item: any) => {
                        const isEquipped = Array.from(inventory.equipped.values()).some((i: any) => i.id === item.id);
                        
                        return (
                            <div style={`
                                background: #1a1a1a; 
                                border: 1px solid ${isEquipped ? '#e68523' : '#333'}; 
                                border-radius: 4px; 
                                padding: 6px; 
                                position: relative;
                                cursor: pointer;
                            `} onClick={() => {
                                if (item.category === 'Weapon' || item.category === 'Armor') {
                                    if (isEquipped) {
                                        selectedObject.unequipItem(item.slot);
                                    } else {
                                        selectedObject.equipItem(item);
                                    }
                                    onRender();
                                }
                            }}>
                                <div style="font-size: 20px; text-align: center; margin-bottom: 4px;">
                                    {item.category === 'Weapon' ? '⚔️' : 
                                     item.category === 'Ammo' ? '🌑' : 
                                     item.category === 'Consumable' ? '🧪' : '📦'}
                                </div>
                                <div style="font-size: 8px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    {item.name}
                                </div>
                                {item.quantity > 1 && (
                                    <div style="position: absolute; top: 2px; right: 4px; font-size: 9px; color: #e68523; font-weight: bold;">
                                        {item.quantity}
                                    </div>
                                )}
                                {isEquipped && (
                                    <div style="font-size: 7px; color: #e68523; margin-top: 2px;">EQUIPPED</div>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                {inventory.items.length === 0 && (
                    <div style="text-align: center; margin-top: 40px; color: #444; font-size: 11px;">
                        Inventory is empty
                    </div>
                )}
            </div>

            <div style="padding: 10px; background: #111; border-top: 1px solid #222;">
                <div style="font-size: 9px; color: #888; margin-bottom: 8px;">Quick Actions</div>
                <div style="display: flex; gap: 4px;">
                    <button style="flex: 1; font-size: 9px; cursor: pointer; padding: 4px;"
                            onClick={() => {
                                // Default debug item
                                inventory.addItem({
                                    name: "Standard Ammo",
                                    category: 'Ammo',
                                    weight: 0.1,
                                    stackable: true,
                                    quantity: 30,
                                    stats: { ammoType: 'Standard' }
                                });
                                onRender();
                            }}>+ Add Ammo</button>
                    <button style="flex: 1; font-size: 9px; cursor: pointer; padding: 4px;"
                            onClick={() => {
                                inventory.addItem({
                                    name: "Combat Rifle",
                                    category: 'Weapon',
                                    weight: 4.5,
                                    stackable: false,
                                    quantity: 1,
                                    slot: 'hand_R',
                                    modelUrl: 'default',
                                    stats: { damage: 25, ammoType: 'Standard' }
                                });
                                onRender();
                            }}>+ Add Rifle</button>
                </div>
            </div>
        </div>
    );
};
