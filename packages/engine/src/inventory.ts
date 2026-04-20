import { nanoid } from 'nanoid';

export type ItemCategory = 'Weapon' | 'Armor' | 'Consumable' | 'Ammo' | 'Material';

/**
 * B3Item: Metadata representing a collectable and equippable item.
 */
export interface B3Item {
    id?: string;
    name: string;
    category: ItemCategory;
    weight: number;
    stackable: boolean;
    quantity: number;
    modelUrl?: string; // URL for the 3D representation
    slot?: string;     // e.g., 'RightHand', 'Head'
    stats?: {
        damage?: number;
        defense?: number;
        healing?: number;
        ammoType?: string;
    };
    metadata?: any;
}

/**
 * InventoryManager: Handles the collection and management of items for a B3Object.
 */
export class InventoryManager {
    public items: B3Item[] = [];
    public equipped: Map<string, B3Item> = new Map(); // Slot Name -> Item
    public maxWeight: number = 100;
    public useWeightLimit: boolean = false;

    constructor() {}

    public addItem(item: B3Item): boolean {
        if (this.useWeightLimit && this.getTotalWeight() + (item.weight * item.quantity) > this.maxWeight) {
            return false;
        }

        if (item.stackable) {
            const existing = this.items.find(i => i.name === item.name);
            if (existing) {
                existing.quantity += item.quantity;
                return true;
            }
        }

        if (!item.id) item.id = nanoid();
        this.items.push(item);
        return true;
    }

    public removeItem(itemId: string, quantity: number = 1): B3Item | null {
        const index = this.items.findIndex(i => i.id === itemId);
        if (index === -1) return null;

        const item = this.items[index];
        if (item.quantity > quantity) {
            item.quantity -= quantity;
            return { ...item, quantity };
        } else {
            this.items.splice(index, 1);
            // If it was equipped, unequip it
            if (item.slot && this.equipped.get(item.slot)?.id === itemId) {
                this.equipped.delete(item.slot);
            }
            return item;
        }
    }

    public getTotalWeight(): number {
        return this.items.reduce((total, item) => total + (item.weight * item.quantity), 0);
    }

    public getItemsByCategory(category: ItemCategory): B3Item[] {
        return this.items.filter(i => i.category === category);
    }

    public findItemByAmmoType(type: string): B3Item | null {
        return this.items.find(i => i.category === 'Ammo' && i.stats?.ammoType === type) || null;
    }

    public toJSON() {
        return {
            items: this.items,
            maxWeight: this.maxWeight,
            useWeightLimit: this.useWeightLimit
        };
    }

    static fromJSON(data: any): InventoryManager {
        const inv = new InventoryManager();
        if (data) {
            inv.items = data.items || [];
            inv.maxWeight = data.maxWeight || 100;
            inv.useWeightLimit = data.useWeightLimit || false;
        }
        return inv;
    }
}
