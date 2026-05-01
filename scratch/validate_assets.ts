import { ASSET_BANK } from '../packages/engine/src/assets';

console.log("--- B3JS Asset Bank Validation ---");
console.log(`Total Assets: ${ASSET_BANK.length}`);

const categories = new Set(ASSET_BANK.map(a => a.category));
console.log(`Categories found: ${Array.from(categories).join(", ")}`);

const duplicates = ASSET_BANK.filter((item, index) => ASSET_BANK.findIndex(i => i.id === item.id) !== index);
if (duplicates.length > 0) {
    console.error("❌ Duplicate Asset IDs found:", duplicates.map(d => d.id));
} else {
    console.log("✅ All Asset IDs are unique.");
}

const missingUrls = ASSET_BANK.filter(a => a.type === 'glb' && !a.url);
if (missingUrls.length > 0) {
    console.error("❌ Assets missing URLs:", missingUrls.map(a => a.name));
} else {
    console.log("✅ All GLB assets have URLs.");
}

const inventoryStats = ASSET_BANK.filter(a => !!a.inventory).length;
console.log(`✅ Assets with Inventory metadata: ${inventoryStats}`);

console.log("--- Validation Complete ---");
