import { B3Engine, B3Object } from '@b3js/engine';

export interface B3EditorProps {
    engine: B3Engine | null;
}

export interface PropertiesProps {
    selectedObject: B3Object | null;
    selectedSubItem?: { parentId: string, type: string, id: string } | null;
    engine: B3Engine | null;
    selectedShaderNode?: any;
    onRender: () => void;
}

export interface InspectorProps {
    objects: B3Object[];
    selectedObject: B3Object | null;
    onSelect: (id: string) => void;
    engine: B3Engine | null;
}

export interface ShaderEditorProps {
    selectedObject: B3Object | null;
    onRender: () => void;
}

export interface NodesEditorProps {
    selectedObject: B3Object | null;
    onRender: () => void;
    engine: B3Engine | null;
}
