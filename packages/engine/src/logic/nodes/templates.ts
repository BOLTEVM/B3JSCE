import { GraphExecutor, VariableStore } from '../graph';
import { OnKeyNode, OnTickNode, OnCollisionNode, OnInteractNode, OnTimerNode } from './events';
import { BranchNode, SequenceNode, DelayNode } from './flow';
import { MathOpNode, CompareNode, GetPropertyNode, SetVariableNode, GetVariableNode } from './data';
import { MoveToNode, RotateNode, DoorToggleNode, DestroyObjectNode, SetMaterialNode, LogNode, SpawnObjectNode, SendMessageNode } from './actions';
import { DayNightCycleNode, WeatherNode, SetSkyColorNode } from './skybox';

/**
 * Pre-built visual scripting templates.
 * Each returns a configured GraphExecutor with nodes and connections ready to go.
 */

export interface TemplateInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: 'Movement' | 'Combat' | 'Interaction' | 'Environment' | 'AI' | 'Utility';
}

export const TEMPLATE_CATALOG: TemplateInfo[] = [
    { id: 'WASD_MOVEMENT',    name: 'WASD Movement',      description: 'First-person keyboard movement',    icon: '🏃', category: 'Movement' },
    { id: 'VEHICLE_DRIVE',    name: 'Vehicle Drive',       description: 'Arrow key vehicle controls',        icon: '🚗', category: 'Movement' },
    { id: 'DOOR_INTERACT',    name: 'Interactive Door',    description: 'Press E to open/close door',        icon: '🚪', category: 'Interaction' },
    { id: 'COMBAT_TURRET',    name: 'Auto Turret',         description: 'Detect and fire at enemies',        icon: '🔫', category: 'Combat' },
    { id: 'PICKUP_ITEM',      name: 'Item Pickup',         description: 'Collect on collision, destroy self', icon: '💎', category: 'Interaction' },
    { id: 'PATROL_AI',        name: 'AI Patrol',           description: 'Move between waypoints on timer',   icon: '🤖', category: 'AI' },
    { id: 'HEALTH_REGEN',     name: 'Health Regen',        description: 'Slowly regenerate health over time', icon: '💚', category: 'Utility' },
    { id: 'SPINNING_PROP',    name: 'Spinning Prop',       description: 'Continuously rotate on Y axis',     icon: '🌀', category: 'Environment' },
    { id: 'DAMAGE_ZONE',      name: 'Damage Zone',         description: 'Hurts actors on contact',           icon: '⚡', category: 'Combat' },
    { id: 'TELEPORTER',       name: 'Teleporter',          description: 'Moves actor to a target position',  icon: '🌀', category: 'Environment' },
    { id: 'DAY_NIGHT_CYCLE',  name: 'Day/Night Cycle',     description: 'Automatic sun orbit with sky transitions', icon: '🌅', category: 'Environment' },
    { id: 'WEATHER_SYSTEM',   name: 'Weather System',      description: 'Dynamic weather with smooth blending',    icon: '⛈️', category: 'Environment' },
];

/**
 * Build a template graph by ID.
 * Returns a GraphExecutor populated with the appropriate nodes and wired connections.
 */
export function buildTemplate(templateId: string): { graph: GraphExecutor, nodes: any[] } {
    const graph = new GraphExecutor();
    const nodes: any[] = [];

    switch (templateId) {
        case 'WASD_MOVEMENT': {
            const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
            const dirs = [
                { x: 0, y: 0, z: -1 },
                { x: 0, y: 0, z: 1 },
                { x: -1, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 }
            ];
            keys.forEach((k, i) => {
                const onKey = new OnKeyNode(k);
                onKey.guiMetadata = { x: 50, y: 50 + i * 140 };
                const move = new MoveToNode();
                move.guiMetadata = { x: 350, y: 50 + i * 140 };
                // Set direction default
                move.inputs.find(p => p.name === 'Direction')!.value = dirs[i];
                
                graph.addNode(onKey);
                graph.addNode(move);
                graph.connect(
                    onKey.outputs.find(p => p.name === 'Pressed')!.id,
                    move.inputs.find(p => p.dataType === 'exec')!.id
                );
                nodes.push(onKey, move);
            });
            break;
        }

        case 'VEHICLE_DRIVE': {
            const fwd = new OnKeyNode('ArrowUp');
            fwd.guiMetadata = { x: 50, y: 50 };
            const back = new OnKeyNode('ArrowDown');
            back.guiMetadata = { x: 50, y: 180 };
            const left = new OnKeyNode('ArrowLeft');
            left.guiMetadata = { x: 50, y: 310 };
            const right = new OnKeyNode('ArrowRight');
            right.guiMetadata = { x: 50, y: 440 };
            
            const moveFwd = new MoveToNode();
            moveFwd.guiMetadata = { x: 350, y: 50 };
            moveFwd.inputs.find(p => p.name === 'Direction')!.value = { x: 0, y: 0, z: -1 };
            moveFwd.inputs.find(p => p.name === 'Speed')!.value = 15;
            
            const moveBack = new MoveToNode();
            moveBack.guiMetadata = { x: 350, y: 180 };
            moveBack.inputs.find(p => p.name === 'Direction')!.value = { x: 0, y: 0, z: 1 };
            moveBack.inputs.find(p => p.name === 'Speed')!.value = 8;
            
            const rotL = new RotateNode();
            rotL.guiMetadata = { x: 350, y: 310 };
            rotL.inputs.find(p => p.name === 'Speed')!.value = 2;

            const rotR = new RotateNode();
            rotR.guiMetadata = { x: 350, y: 440 };
            rotR.inputs.find(p => p.name === 'Speed')!.value = -2;
            
            [fwd, back, left, right, moveFwd, moveBack, rotL, rotR].forEach(n => graph.addNode(n));
            graph.connect(fwd.outputs[0].id, moveFwd.inputs[0].id);
            graph.connect(back.outputs[0].id, moveBack.inputs[0].id);
            graph.connect(left.outputs[0].id, rotL.inputs[0].id);
            graph.connect(right.outputs[0].id, rotR.inputs[0].id);
            nodes.push(fwd, back, left, right, moveFwd, moveBack, rotL, rotR);
            break;
        }

        case 'DOOR_INTERACT': {
            const interact = new OnInteractNode('KeyE', 3);
            interact.guiMetadata = { x: 50, y: 80 };
            const door = new DoorToggleNode();
            door.guiMetadata = { x: 350, y: 80 };
            const log = new LogNode();
            log.guiMetadata = { x: 600, y: 80 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Door toggled!';
            
            graph.addNode(interact);
            graph.addNode(door);
            graph.addNode(log);
            graph.connect(interact.outputs[0].id, door.inputs[0].id);
            graph.connect(door.outputs[0].id, log.inputs[0].id);
            nodes.push(interact, door, log);
            break;
        }

        case 'COMBAT_TURRET': {
            const tick = new OnTickNode();
            tick.guiMetadata = { x: 50, y: 80 };
            const detect = new OnCollisionNode('Actor');
            detect.guiMetadata = { x: 50, y: 220 };
            const branch = new BranchNode();
            branch.guiMetadata = { x: 350, y: 140 };
            const rotate = new RotateNode();
            rotate.guiMetadata = { x: 600, y: 80 };
            const log = new LogNode();
            log.guiMetadata = { x: 600, y: 220 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Target acquired!';

            [tick, detect, branch, rotate, log].forEach(n => graph.addNode(n));
            graph.connect(tick.outputs[0].id, branch.inputs[0].id);
            graph.connect(branch.outputs[0].id, rotate.inputs[0].id); // True → Rotate
            graph.connect(branch.outputs[1].id, log.inputs[0].id);    // False → Log
            nodes.push(tick, detect, branch, rotate, log);
            break;
        }

        case 'PICKUP_ITEM': {
            const collision = new OnCollisionNode('Actor');
            collision.guiMetadata = { x: 50, y: 80 };
            const send = new SendMessageNode();
            send.guiMetadata = { x: 350, y: 80 };
            send.inputs.find(p => p.name === 'Channel')!.value = 'item_collected';
            const destroy = new DestroyObjectNode();
            destroy.guiMetadata = { x: 600, y: 80 };

            [collision, send, destroy].forEach(n => graph.addNode(n));
            graph.connect(collision.outputs[0].id, send.inputs[0].id);
            graph.connect(send.outputs[0].id, destroy.inputs[0].id);
            nodes.push(collision, send, destroy);
            break;
        }

        case 'PATROL_AI': {
            const timer = new OnTimerNode();
            timer.interval = 3;
            timer.guiMetadata = { x: 50, y: 80 };
            const move = new MoveToNode();
            move.guiMetadata = { x: 350, y: 80 };
            move.inputs.find(p => p.name === 'Speed')!.value = 3;
            const rotate = new RotateNode();
            rotate.guiMetadata = { x: 350, y: 220 };
            rotate.inputs.find(p => p.name === 'Speed')!.value = 3.14;

            const seq = new SequenceNode(2);
            seq.guiMetadata = { x: 200, y: 150 };

            [timer, seq, move, rotate].forEach(n => graph.addNode(n));
            graph.connect(timer.outputs[0].id, seq.inputs[0].id);
            graph.connect(seq.outputs[0].id, move.inputs[0].id);
            graph.connect(seq.outputs[1].id, rotate.inputs[0].id);
            nodes.push(timer, seq, move, rotate);
            break;
        }

        case 'HEALTH_REGEN': {
            const tick = new OnTickNode();
            tick.guiMetadata = { x: 50, y: 80 };
            const getProp = new GetPropertyNode('health');
            getProp.guiMetadata = { x: 250, y: 180 };
            const compare = new CompareNode('<');
            compare.guiMetadata = { x: 400, y: 80 };
            compare.inputs.find(p => p.name === 'B')!.value = 100;
            const math = new MathOpNode('Add');
            math.guiMetadata = { x: 550, y: 80 };
            math.inputs.find(p => p.name === 'B')!.value = 0.1;

            [tick, getProp, compare, math].forEach(n => graph.addNode(n));
            nodes.push(tick, getProp, compare, math);
            break;
        }

        case 'SPINNING_PROP': {
            const tick = new OnTickNode();
            tick.guiMetadata = { x: 50, y: 80 };
            const rotate = new RotateNode();
            rotate.guiMetadata = { x: 350, y: 80 };
            rotate.inputs.find(p => p.name === 'Speed')!.value = 1;

            graph.addNode(tick);
            graph.addNode(rotate);
            graph.connect(tick.outputs[0].id, rotate.inputs[0].id);
            nodes.push(tick, rotate);
            break;
        }

        case 'DAMAGE_ZONE': {
            const collision = new OnCollisionNode('Actor');
            collision.guiMetadata = { x: 50, y: 80 };
            const log = new LogNode();
            log.guiMetadata = { x: 350, y: 80 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Damage applied!';
            const setMat = new SetMaterialNode();
            setMat.guiMetadata = { x: 350, y: 200 };
            setMat.inputs.find(p => p.name === 'Color')!.value = 0xff0000;

            [collision, log, setMat].forEach(n => graph.addNode(n));
            graph.connect(collision.outputs[0].id, log.inputs[0].id);
            nodes.push(collision, log, setMat);
            break;
        }

        case 'TELEPORTER': {
            const interact = new OnInteractNode('KeyE', 2);
            interact.guiMetadata = { x: 50, y: 80 };
            const move = new MoveToNode();
            move.guiMetadata = { x: 350, y: 80 };
            move.inputs.find(p => p.name === 'Direction')!.value = { x: 0, y: 10, z: 0 };
            move.inputs.find(p => p.name === 'Speed')!.value = 50;
            const log = new LogNode();
            log.guiMetadata = { x: 600, y: 80 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Teleported!';

            [interact, move, log].forEach(n => graph.addNode(n));
            graph.connect(interact.outputs[0].id, move.inputs[0].id);
            graph.connect(move.outputs[0].id, log.inputs[0].id);
            nodes.push(interact, move, log);
            break;
        }

        case 'DAY_NIGHT_CYCLE': {
            const cycle = new DayNightCycleNode();
            cycle.guiMetadata = { x: 50, y: 80 };
            cycle.inputs.find(p => p.name === 'CycleDuration')!.value = 120;
            cycle.inputs.find(p => p.name === 'StartTime')!.value = 0.25;
            const log = new LogNode();
            log.guiMetadata = { x: 350, y: 200 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Day/Night cycle active';

            [cycle, log].forEach(n => graph.addNode(n));
            graph.connect(cycle.outputs[0].id, log.inputs[0].id);
            nodes.push(cycle, log);
            break;
        }

        case 'WEATHER_SYSTEM': {
            const timer = new OnTimerNode();
            timer.interval = 30;
            timer.guiMetadata = { x: 50, y: 80 };
            const weather = new WeatherNode();
            weather.guiMetadata = { x: 350, y: 80 };
            weather.inputs.find(p => p.name === 'Preset')!.value = 'Clear';
            weather.inputs.find(p => p.name === 'TransitionSpeed')!.value = 0.5;
            const log = new LogNode();
            log.guiMetadata = { x: 600, y: 80 };
            log.inputs.find(p => p.name === 'Message')!.value = 'Weather changed!';

            [timer, weather, log].forEach(n => graph.addNode(n));
            graph.connect(timer.outputs[0].id, weather.inputs[0].id);
            graph.connect(weather.outputs[0].id, log.inputs[0].id);
            nodes.push(timer, weather, log);
            break;
        }
    }

    return { graph, nodes };
}
