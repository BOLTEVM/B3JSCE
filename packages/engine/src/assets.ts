/**
 * B3JS Asset Registry (Item Bank)
 * Centralized manifest for all spawnable 3D objects.
 */

import { B3Item } from './inventory';

export interface AssetEntry {
    id: string;
    name: string;
    category: 'Furniture' | 'Props' | 'Primitives' | 'Web3' | 'Lights' | 'Robotics' | 'Pickups';
    type: 'glb' | 'factory';
    url?: string;
    factory?: string;
    icon: string;
    description: string;
    voiceKeywords: string[];
    inventory?: Partial<B3Item>; // Optional metadata for collectable items
}

export const ASSET_BANK: AssetEntry[] = [
    // --- FURNITURE ---
    {
        id: 'chair_modern',
        name: 'Modern Chair',
        category: 'Furniture',
        type: 'glb',
        url: '/models/chair.glb',
        icon: '🪑',
        description: 'A sleek, modern seating unit.',
        voiceKeywords: ['chair', 'seat', 'stool', 'sit'],
        inventory: { weight: 5, category: 'Material', stackable: true }
    },
    {
        id: 'table_modern',
        name: 'Modern Table',
        category: 'Furniture',
        type: 'glb',
        url: '/models/table.glb',
        icon: '🗄️',
        description: 'A minimalist designer table.',
        voiceKeywords: ['table', 'desk', 'surface'],
        inventory: { weight: 12, category: 'Material', stackable: false }
    },

    // --- PRIMITIVES ---
    {
        id: 'primitive_cube',
        name: 'Cube',
        category: 'Primitives',
        type: 'factory',
        factory: 'createCube',
        icon: '📦',
        description: 'Standard 1x1x1 physics cube.',
        voiceKeywords: ['cube', 'box', 'block'],
        inventory: { weight: 2, category: 'Material', stackable: true }
    },
    {
        id: 'primitive_sphere',
        name: 'Sphere',
        category: 'Primitives',
        type: 'factory',
        factory: 'createSphere',
        icon: '⚽',
        description: 'Standard 1m diameter physics sphere.',
        voiceKeywords: ['sphere', 'ball', 'orb', 'globe'],
        inventory: { weight: 2, category: 'Material', stackable: true }
    },

    // --- WEB3 ---
    {
        id: 'web3_gateway',
        name: 'Web3 Gateway',
        category: 'Web3',
        type: 'factory',
        factory: 'createWeb3Gateway',
        icon: '🌐',
        description: 'A portal for blockchain event spawning.',
        voiceKeywords: ['gateway', 'portal', 'web3', 'bridge']
    },
    {
        id: 'market_terminal',
        name: 'Market Terminal',
        category: 'Web3',
        type: 'factory',
        factory: 'createMarketTerminal',
        icon: '📈',
        description: 'Real-time exchange and orderbook UI.',
        voiceKeywords: ['terminal', 'market', 'exchange', 'trading']
    },
    {
        id: 'kiosk_shop',
        name: 'Merchant Kiosk',
        category: 'Web3',
        type: 'factory',
        factory: 'createShopKiosk',
        icon: '🏪',
        description: 'Interactive unit for in-game commerce.',
        voiceKeywords: ['shop', 'store', 'merchant', 'kiosk']
    },

    // --- PROPS ---
    {
        id: 'prop_tablet',
        name: 'Bolt Tablet',
        category: 'Props',
        type: 'glb',
        url: '/models/bolt-tablet.glb',
        icon: '📱',
        description: 'Interactive tablet interface.',
        voiceKeywords: ['tablet', 'pad', 'device', 'screen'],
        inventory: { weight: 1, category: 'Consumable', stackable: false }
    },
    {
        id: 'prop_engine',
        name: 'Bolt Engine',
        category: 'Props',
        type: 'glb',
        url: '/models/bolt-engine.glb',
        icon: '⚙️',
        description: 'Large decorative engine turbine.',
        voiceKeywords: ['engine', 'turbine', 'motor'],
        inventory: { weight: 50, category: 'Material', stackable: false }
    },

    // --- LIGHTS ---
    {
        id: 'light_point',
        name: 'Point Light',
        category: 'Lights',
        type: 'factory',
        factory: 'createLight',
        icon: '💡',
        description: 'Omnidirectional light source.',
        voiceKeywords: ['light', 'lamp', 'glow']
    },

    // --- ROBOTICS ---
    {
        id: 'robot_unitree',
        name: 'Unitree B1',
        category: 'Robotics',
        type: 'factory',
        factory: 'createUnitreeBot',
        icon: '🐕',
        description: 'Quadruped robotic digital twin.',
        voiceKeywords: ['robot', 'dog', 'bot', 'unitree'],
        inventory: { weight: 25, category: 'Material', stackable: false }
    },

    // --- PICKUPS ---
    {
        id: 'pickup_health',
        name: 'Medkit',
        category: 'Pickups',
        type: 'factory',
        factory: 'createHealthPickup',
        icon: '🩹',
        description: 'Restores 25 HP on use.',
        voiceKeywords: ['medkit', 'health', 'heal', 'kit'],
        inventory: { weight: 0.5, category: 'Consumable', stackable: true, stats: { healing: 25 } }
    },
    {
        id: 'pickup_ammo',
        name: 'Ammo Case',
        category: 'Pickups',
        type: 'factory',
        factory: 'createAmmoPickup',
        icon: '🔋',
        description: 'Standard ammunition pack.',
        voiceKeywords: ['ammo', 'bullets', 'mag', 'reload'],
        inventory: { weight: 1, category: 'Ammo', stackable: true, stats: { ammoType: 'Standard' } }
    }
];
