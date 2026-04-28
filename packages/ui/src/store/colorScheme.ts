/**
 * World Color Scheme — persisted via localStorage.
 * Controls the primary accent color across the entire editor UI.
 */

export interface ColorScheme {
    id: string;
    name: string;
    accent: string;       // Primary accent hex
    accentLight: string;  // Lighter variant (hover borders, etc.)
}

export const COLOR_SCHEMES: ColorScheme[] = [
    { id: 'orange',  name: 'BOLT Orange',    accent: '#e68523', accentLight: '#ff9d42' },
    { id: 'cyan',    name: 'Neon Cyan',      accent: '#00d4ff', accentLight: '#5ee7ff' },
    { id: 'purple',  name: 'Deep Purple',    accent: '#8b5cf6', accentLight: '#a78bfa' },
    { id: 'green',   name: 'Matrix Green',   accent: '#00ff88', accentLight: '#66ffb2' },
    { id: 'red',     name: 'Crimson',        accent: '#ff3366', accentLight: '#ff6690' },
    { id: 'gold',    name: 'Gold',           accent: '#f5a623', accentLight: '#ffd56b' },
    { id: 'pink',    name: 'Hot Pink',       accent: '#ec4899', accentLight: '#f472b6' },
    { id: 'white',   name: 'Monochrome',     accent: '#cccccc', accentLight: '#ffffff' },
];

const STORAGE_KEY = 'B3JS_COLOR_SCHEME';

export function getActiveScheme(): ColorScheme {
    const id = localStorage.getItem(STORAGE_KEY) || 'orange';
    return COLOR_SCHEMES.find(s => s.id === id) || COLOR_SCHEMES[0];
}

export function setActiveScheme(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
}
