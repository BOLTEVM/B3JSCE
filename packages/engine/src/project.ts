import { nanoid } from 'nanoid';

export interface ProjectRecord {
    id: string;
    name: string;
    lastModified: number;
    activeScene?: string;
}

export class ProjectManager {
    private readonly LIST_KEY = 'B3JS_PROJECT_LIST';
    private readonly PREFIX = 'B3JS_PROJ_';

    /** Get a list of all saved project metadata */
    list(): ProjectRecord[] {
        const raw = localStorage.getItem(this.LIST_KEY);
        try {
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("B3JS Engine: Failed to parse project list", e);
            return [];
        }
    }

    /** Save current project data to a slot */
    save(name: string, data: string, id?: string): string {
        const list = this.list();
        const finalId = id || nanoid();
        const timestamp = Date.now();

        const existingIndex = list.findIndex(p => p.id === finalId);
        if (existingIndex !== -1) {
            list[existingIndex].name = name;
            list[existingIndex].lastModified = timestamp;
        } else {
            list.push({ id: finalId, name, lastModified: timestamp });
        }

        // Keep local storage clean
        localStorage.setItem(this.LIST_KEY, JSON.stringify(list));
        localStorage.setItem(this.PREFIX + finalId, data);
        
        console.log(`B3JS Engine: Project '${name}' saved successfully (ID: ${finalId})`);
        return finalId;
    }

    /** Load project data by ID */
    load(id: string): string | null {
        return localStorage.getItem(this.PREFIX + id);
    }

    /** Rename a project in the list */
    rename(id: string, newName: string) {
        const list = this.list();
        const item = list.find(p => p.id === id);
        if (item) {
            item.name = newName;
            localStorage.setItem(this.LIST_KEY, JSON.stringify(list));
        }
    }

    /** Permanently delete a project */
    delete(id: string) {
        const list = this.list().filter(p => p.id !== id);
        localStorage.setItem(this.LIST_KEY, JSON.stringify(list));
        localStorage.removeItem(this.PREFIX + id);
    }

    /** Clear all projects (factory reset) */
    clear() {
        const list = this.list();
        list.forEach(p => localStorage.removeItem(this.PREFIX + p.id));
        localStorage.removeItem(this.LIST_KEY);
    }
}
