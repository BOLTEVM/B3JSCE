import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { B3Object } from './B3Object';

// Undo/Redo Command Pattern
export interface Command {
    execute(): void;
    undo(): void;
}

export class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];

    execute(command: Command) {
        command.execute();
        this.undoStack.push(command);
        this.redoStack = []; // Clear redo stack on new command
    }

    undo() {
        const cmd = this.undoStack.pop();
        if (cmd) {
            cmd.undo();
            this.redoStack.push(cmd);
        }
    }

    redo() {
        const cmd = this.redoStack.pop();
        if (cmd) {
            cmd.execute();
            this.undoStack.push(cmd);
        }
    }
}

export class MoveObjectCommand implements Command {
    constructor(
        private obj: B3Object,
        private oldPos: THREE.Vector3,
        private oldRot: THREE.Quaternion,
        private newPos: THREE.Vector3,
        private newRot: THREE.Quaternion
    ) {}

    execute() {
        this.obj.object.position.copy(this.newPos);
        this.obj.object.quaternion.copy(this.newRot);
        if (this.obj.body) {
            this.obj.body.position.copy(this.newPos as any);
            this.obj.body.quaternion.copy(this.newRot as any);
        }
    }

    undo() {
        this.obj.object.position.copy(this.oldPos);
        this.obj.object.quaternion.copy(this.oldRot);
        if (this.obj.body) {
            this.obj.body.position.copy(this.oldPos as any);
            this.obj.body.quaternion.copy(this.oldRot as any);
        }
    }
}

export class ScaleObjectCommand implements Command {
    constructor(
        private obj: B3Object,
        private oldScale: THREE.Vector3,
        private newScale: THREE.Vector3
    ) {}

    execute() {
        this.obj.object.scale.copy(this.newScale);
        (this.obj as any)._physicsDirty = true;
    }

    undo() {
        this.obj.object.scale.copy(this.oldScale);
        (this.obj as any)._physicsDirty = true;
    }
}

export class SetPropertyCommand implements Command {
    private oldValue: any;
    constructor(
        private target: any,
        private property: string,
        private newValue: any
    ) {
        this.oldValue = this.resolve(target, property);
    }
    private resolve(obj: any, path: string): any {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
        return cur[keys[keys.length - 1]];
    }
    private assign(obj: any, path: string, val: any): void {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
        cur[keys[keys.length - 1]] = val;
    }
    execute() { this.assign(this.target, this.property, this.newValue); }
    undo() { this.assign(this.target, this.property, this.oldValue); }
}
