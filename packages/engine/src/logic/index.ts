// ─── Logic Brick Module Barrel ───────────────────────────────────
// Re-exports all logic types and triggers boot-time type registration.

// V1 Base Types
export { LogicNode, Sensor, Controller, Actuator } from './base';
export type { LogicState, B3ObjectRef, B3EngineRef } from './base';

// V1 Concrete Implementations
export { KeyboardSensor, CollisionSensor, MiningSensor } from './sensors';
export { AndController, PythonController } from './controllers';
export { MotionActuator, MiningActuator, Web3ConnectActuator, InventoryActuator } from './actuators';
export { AudioReactiveActuator, SpinnerActuator, VideoPlayerActuator } from './bolt_nodes';
export { SwapSensor, SwapController, SwapActuator } from './swap_nodes';
export { WalletActuator, PinPadActuator } from './wallet_nodes';
export { RacingWheelActuator } from './racing_wheel_actuator';
export { VehicleDriveActuator } from '../vehicle_nodes';

// ZK Privacy Nodes
export { ZKZoneSensor, ZKProximitySensor, ZKRevealSensor, ZKCommitActuator, ZKRevealActuator, ZKProveActuator, ZKZoneActuator } from './zk_nodes';

// ZK Ceremony Nodes
export { CeremonyTurnSensor, CeremonyPhaseSensor, CeremonyContributionSensor, CeremonyContributeActuator, CeremonyFinalizeActuator, CeremonyUnlockActuator } from './ceremony_nodes';

// QuaiAxe Burn-Mining Nodes
export { QuaiAxeMiningSensor, QuaiAxeBurnSensor, QuaiAxeFeedActuator, QuaiAxePaintActuator } from './qaxe_nodes';

// Rhythm Arcade — DeFi rhythm mini-games
export { RhythmBeatSensor, RhythmJudgementSensor, RhythmFeverSensor, RhythmStartActuator, RhythmLaneActuator } from './rhythm_nodes';

// V2 Pin System
export { canConnect, PIN_COLORS } from './pins';
export type { IPin, IConnection, PinDataType, PinDirection } from './pins';

// V2 Graph Executor
export { GraphExecutor, VariableStore } from './graph';
export type { ExecutionContext, IGraphNode, NodeInfo } from './graph';

// V2 Event Nodes
export { OnStartNode, OnTickNode, OnKeyNode, OnCollisionNode, OnTimerNode, OnInteractNode } from './nodes/events';

// V2 Flow Nodes
export { BranchNode, SequenceNode, ForLoopNode, DelayNode, GateNode } from './nodes/flow';

// V2 Data Nodes
export { GetVariableNode, SetVariableNode, MathOpNode, CompareNode, BoolLogicNode, GetPropertyNode, SetPropertyNode } from './nodes/data';

// V2 Action Nodes
export { MoveToNode, RotateNode, PlaySoundNode, SpawnObjectNode, DestroyObjectNode, SendMessageNode, LogNode, SetMaterialNode, DoorToggleNode, CutSceneNode } from './nodes/actions';

// V2 Skybox Nodes
export { createProceduralSky, SetSkyColorNode, DayNightCycleNode, SetSunNode, WeatherNode, StarFieldNode } from './nodes/skybox';
export type { WeatherPreset } from './nodes/skybox';

// V2 Templates
export { TEMPLATE_CATALOG, buildTemplate } from './nodes/templates';
export type { TemplateInfo } from './nodes/templates';

// C# Scripting
export { CSharpController, getCSharpCompileMode, setCSharpCompileMode } from './csharp';
export type { CSharpCompileMode } from './csharp';

// ─── Register Built-in Logic Types (V1) ────────────────────────
import { registerSensorType, registerControllerType, registerActuatorType } from '../core/registry';
import { KeyboardSensor, CollisionSensor, MiningSensor } from './sensors';
import { AndController, PythonController } from './controllers';
import { MotionActuator, MiningActuator, InventoryActuator, Web3ConnectActuator } from './actuators';
import { AudioReactiveActuator, SpinnerActuator, VideoPlayerActuator } from './bolt_nodes';
import { SwapSensor, SwapController, SwapActuator } from './swap_nodes';
import { WalletActuator, PinPadActuator } from './wallet_nodes';
import { CSharpController } from './csharp';
import { ZKZoneSensor, ZKProximitySensor, ZKRevealSensor, ZKCommitActuator, ZKRevealActuator, ZKProveActuator, ZKZoneActuator } from './zk_nodes';
import { CeremonyTurnSensor, CeremonyPhaseSensor, CeremonyContributionSensor, CeremonyContributeActuator, CeremonyFinalizeActuator, CeremonyUnlockActuator } from './ceremony_nodes';
import { QuaiAxeMiningSensor, QuaiAxeBurnSensor, QuaiAxeFeedActuator, QuaiAxePaintActuator } from './qaxe_nodes';
import { RhythmBeatSensor, RhythmJudgementSensor, RhythmFeverSensor, RhythmStartActuator, RhythmLaneActuator } from './rhythm_nodes';
import { RacingWheelActuator } from './racing_wheel_actuator';
import { VehicleDriveActuator } from '../vehicle_nodes';

// V1 Sensors
registerSensorType('KeyboardSensor', (d) => KeyboardSensor.fromJSON(d));
registerSensorType('CollisionSensor', (d) => CollisionSensor.fromJSON(d));
registerSensorType('MiningSensor', (d) => MiningSensor.fromJSON(d));
registerSensorType('SwapSensor', (d) => SwapSensor.fromJSON(d));

// V1 Controllers
registerControllerType('AndController', (d) => AndController.fromJSON(d));
registerControllerType('PythonController', (d) => PythonController.fromJSON(d));
registerControllerType('CSharpController', (d) => CSharpController.fromJSON(d));
registerControllerType('SwapController', (d) => SwapController.fromJSON(d));

// V1 Actuators
registerActuatorType('MotionActuator', (d, ctx) => MotionActuator.fromJSON(d, ctx?.object));
registerActuatorType('MiningActuator', (d) => MiningActuator.fromJSON(d, () => {}));
registerActuatorType('InventoryActuator', (d) => InventoryActuator.fromJSON(d));
registerActuatorType('Web3ConnectActuator', (d) => Web3ConnectActuator.fromJSON(d));
registerActuatorType('AudioReactiveActuator', (d) => AudioReactiveActuator.fromJSON(d));
registerActuatorType('SpinnerActuator', (d) => SpinnerActuator.fromJSON(d));
registerActuatorType('VideoPlayerActuator', (d) => VideoPlayerActuator.fromJSON(d));
registerActuatorType('SwapActuator', (d) => SwapActuator.fromJSON(d));
registerActuatorType('WalletActuator', (d) => WalletActuator.fromJSON(d));
registerActuatorType('PinPadActuator', (d) => PinPadActuator.fromJSON(d));
registerActuatorType('RacingWheelActuator', (d) => RacingWheelActuator.fromJSON(d));
registerActuatorType('VehicleDriveActuator', (d) => VehicleDriveActuator.fromJSON(d));

// ZK Privacy Nodes
registerSensorType('ZKZoneSensor', (d) => ZKZoneSensor.fromJSON(d));
registerSensorType('ZKProximitySensor', (d) => ZKProximitySensor.fromJSON(d));
registerSensorType('ZKRevealSensor', (d) => ZKRevealSensor.fromJSON(d));
registerActuatorType('ZKCommitActuator', (d) => ZKCommitActuator.fromJSON(d));
registerActuatorType('ZKRevealActuator', (d) => ZKRevealActuator.fromJSON(d));
registerActuatorType('ZKProveActuator', (d) => ZKProveActuator.fromJSON(d));
registerActuatorType('ZKZoneActuator', (d) => ZKZoneActuator.fromJSON(d));

// ZK Ceremony Nodes
registerSensorType('CeremonyTurnSensor', (d) => CeremonyTurnSensor.fromJSON(d));
registerSensorType('CeremonyPhaseSensor', (d) => CeremonyPhaseSensor.fromJSON(d));
registerSensorType('CeremonyContributionSensor', (d) => CeremonyContributionSensor.fromJSON(d));
registerActuatorType('CeremonyContributeActuator', (d) => CeremonyContributeActuator.fromJSON(d));
registerActuatorType('CeremonyFinalizeActuator', (d) => CeremonyFinalizeActuator.fromJSON(d));
registerActuatorType('CeremonyUnlockActuator', (d) => CeremonyUnlockActuator.fromJSON(d));

// QuaiAxe Burn-Mining Nodes
registerSensorType('QuaiAxeMiningSensor', (d) => QuaiAxeMiningSensor.fromJSON(d));
registerSensorType('QuaiAxeBurnSensor', (d) => QuaiAxeBurnSensor.fromJSON(d));
registerActuatorType('QuaiAxeFeedActuator', (d) => QuaiAxeFeedActuator.fromJSON(d));
registerActuatorType('QuaiAxePaintActuator', (d) => QuaiAxePaintActuator.fromJSON(d));

// Rhythm Arcade Nodes
registerSensorType('RhythmBeatSensor', (d) => RhythmBeatSensor.fromJSON(d));
registerSensorType('RhythmJudgementSensor', (d) => RhythmJudgementSensor.fromJSON(d));
registerSensorType('RhythmFeverSensor', (d) => RhythmFeverSensor.fromJSON(d));
registerActuatorType('RhythmStartActuator', (d) => RhythmStartActuator.fromJSON(d));
registerActuatorType('RhythmLaneActuator', (d) => RhythmLaneActuator.fromJSON(d));

// ─── Register V2 Graph Node Types ──────────────────────────────
import { OnStartNode, OnTickNode, OnKeyNode, OnCollisionNode, OnTimerNode, OnInteractNode } from './nodes/events';
import { BranchNode, SequenceNode, ForLoopNode, DelayNode, GateNode } from './nodes/flow';
import { GetVariableNode, SetVariableNode, MathOpNode, CompareNode, BoolLogicNode, GetPropertyNode, SetPropertyNode } from './nodes/data';
import { MoveToNode, RotateNode, PlaySoundNode, SpawnObjectNode, DestroyObjectNode, SendMessageNode, LogNode, SetMaterialNode, DoorToggleNode, CutSceneNode } from './nodes/actions';
import { SetSkyColorNode, DayNightCycleNode, SetSunNode, WeatherNode, StarFieldNode } from './nodes/skybox';

// Events
registerSensorType('OnStartNode', (d) => OnStartNode.fromJSON(d));
registerSensorType('OnTickNode', (d) => OnTickNode.fromJSON(d));
registerSensorType('OnKeyNode', (d) => OnKeyNode.fromJSON(d));
registerSensorType('OnCollisionNode', (d) => OnCollisionNode.fromJSON(d));
registerSensorType('OnTimerNode', (d) => OnTimerNode.fromJSON(d));
registerSensorType('OnInteractNode', (d) => OnInteractNode.fromJSON(d));
registerSensorType('DayNightCycleNode', (d) => DayNightCycleNode.fromJSON(d));

// Flow
registerControllerType('BranchNode', (d) => BranchNode.fromJSON(d));
registerControllerType('SequenceNode', (d) => SequenceNode.fromJSON(d));
registerControllerType('ForLoopNode', (d) => ForLoopNode.fromJSON(d));
registerControllerType('DelayNode', (d) => DelayNode.fromJSON(d));
registerControllerType('GateNode', (d) => GateNode.fromJSON(d));

// Data
registerSensorType('GetVariableNode', (d) => GetVariableNode.fromJSON(d));
registerSensorType('SetVariableNode', (d) => SetVariableNode.fromJSON(d));
registerSensorType('MathOpNode', (d) => MathOpNode.fromJSON(d));
registerSensorType('CompareNode', (d) => CompareNode.fromJSON(d));
registerSensorType('BoolLogicNode', (d) => BoolLogicNode.fromJSON(d));
registerSensorType('GetPropertyNode', (d) => GetPropertyNode.fromJSON(d));
registerSensorType('SetPropertyNode', (d) => SetPropertyNode.fromJSON(d));

// Actions
registerActuatorType('MoveToNode', (d) => MoveToNode.fromJSON(d));
registerActuatorType('RotateNode', (d) => RotateNode.fromJSON(d));
registerActuatorType('PlaySoundNode', (d) => PlaySoundNode.fromJSON(d));
registerActuatorType('SpawnObjectNode', (d) => SpawnObjectNode.fromJSON(d));
registerActuatorType('DestroyObjectNode', (d) => DestroyObjectNode.fromJSON(d));
registerActuatorType('SendMessageNode', (d) => SendMessageNode.fromJSON(d));
registerActuatorType('LogNode', (d) => LogNode.fromJSON(d));
registerActuatorType('SetMaterialNode', (d) => SetMaterialNode.fromJSON(d));
registerActuatorType('DoorToggleNode', (d) => DoorToggleNode.fromJSON(d));
registerActuatorType('CutSceneNode', (d) => CutSceneNode.fromJSON(d));

// Skybox
registerActuatorType('SetSkyColorNode', (d) => SetSkyColorNode.fromJSON(d));
registerActuatorType('SetSunNode', (d) => SetSunNode.fromJSON(d));
registerActuatorType('WeatherNode', (d) => WeatherNode.fromJSON(d));
registerActuatorType('StarFieldNode', (d) => StarFieldNode.fromJSON(d));
