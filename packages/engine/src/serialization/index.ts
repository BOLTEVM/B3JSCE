/**
 * B3JS Serialization — Public API
 */

export { type ComponentSerializer, migrateComponentData } from './ComponentSerializer';
export { registerSerializer, getSerializer, saveWorld, loadWorld, type SaveFile } from './SerializationRegistry';
