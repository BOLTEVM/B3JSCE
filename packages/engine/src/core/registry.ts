import type { ShaderNode } from '../shaders';

// ─── Logic Brick Type Registries ─────────────────────────────────
// Factory signatures accept `any` to support both V1 subtypes (Sensor, Controller, Actuator)
// and V2 graph nodes that extend LogicNode directly.
const _sensorRegistry = new Map<string, (data: any, ctx?: any) => any>();
const _controllerRegistry = new Map<string, (data: any, ctx?: any) => any>();
const _actuatorRegistry = new Map<string, (data: any, ctx?: any) => any>();
const _shaderNodeRegistry = new Map<string, (data: any) => ShaderNode>();
const _nodeRegistry = new Map<string, (data: any, ctx?: any) => any>();

export function registerSensorType(type: string, factory: (data: any, ctx?: any) => any) { _sensorRegistry.set(type, factory); }
export function registerControllerType(type: string, factory: (data: any, ctx?: any) => any) { _controllerRegistry.set(type, factory); }
export function registerActuatorType(type: string, factory: (data: any, ctx?: any) => any) { _actuatorRegistry.set(type, factory); }
export function registerShaderNodeType(type: string, factory: (data: any) => ShaderNode) { _shaderNodeRegistry.set(type, factory); }
/** Generic V2 node registration — for nodes that extend LogicNode directly. */
export function registerNodeType(type: string, factory: (data: any, ctx?: any) => any) { _nodeRegistry.set(type, factory); }

export function getSensorFactory(type: string) { return _sensorRegistry.get(type); }
export function getControllerFactory(type: string) { return _controllerRegistry.get(type); }
export function getActuatorFactory(type: string) { return _actuatorRegistry.get(type); }
export function getShaderNodeFactory(type: string) { return _shaderNodeRegistry.get(type); }
export function getNodeFactory(type: string) { return _nodeRegistry.get(type); }

