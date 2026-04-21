import * as webjsx from 'webjsx';

export const ProjectModal = ({ isOpen, onClose, engine, onRender }: any) => {
    if (!isOpen) return <div />;

    const projects = engine?.projects.list() || [];

    const handleLoad = (id: string) => {
        const data = engine.projects.load(id);
        if (data) {
            engine.deserialize(data);
            engine.activeProjectId = id;
            onClose();
        }
    };

    const handleDelete = (id: string) => {
        if (confirm("Permanently delete this project?")) {
            engine.projects.delete(id);
            if (engine.activeProjectId === id) engine.activeProjectId = null;
            onRender();
        }
    };

    const handleNew = () => {
        if (confirm("Discard unsaved changes?")) {
            engine.resetScene();
            engine.activeProjectId = null;
            onClose();
        }
    };

    return (
        <div class="modal-overlay" onClick={onClose}>
            <div class="modal-content" style="max-width: 600px;" onClick={(e: any) => e.stopPropagation()}>
                <div class="modal-header">
                    <div style="font-size: 18px; font-weight: bold; color: #6366f1;">🗂 Project Gallery</div>
                    <span class="close-btn" onClick={onClose}>✕</span>
                </div>

                <div class="project-list-container" style="max-height: 400px; overflow-y: auto; margin-top: 15px;">
                    {projects.length === 0 ? (
                        <div style="text-align: center; padding: 40px; opacity: 0.5;">
                            No projects saved yet.
                        </div>
                    ) : (
                        projects.map((p: any) => (
                            <div class="setting-card" style={`display: flex; justify-content: space-between; align-items: center; border-left-color: ${engine.activeProjectId === p.id ? '#00ff88' : '#6366f1'}`}>
                                <div>
                                    <div style="font-weight: 600; font-size: 14px;">{p.name} {engine.activeProjectId === p.id && <span style="font-size: 10px; color: #00ff88; margin-left: 8px;">(Active)</span>}</div>
                                    <div style="font-size: 11px; opacity: 0.5;">Last modified: {new Date(p.lastModified).toLocaleString()}</div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="menu-btn" style="background: rgba(99, 102, 241, 0.2); font-size: 11px;" onClick={() => handleLoad(p.id)}>Load</button>
                                    <button class="menu-btn" style="background: rgba(239, 68, 68, 0.2); font-size: 11px;" onClick={() => handleDelete(p.id)}>Delete</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                    <button class="menu-btn" style="background: #10b981; color: #fff;" onClick={handleNew}>+ New Project</button>
                </div>
            </div>
        </div>
    );
};
