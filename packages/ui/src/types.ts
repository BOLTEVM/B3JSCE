import { B3Engine, B3Object } from '@b3js/engine';

export type B3EditorProps = {
    engine: B3Engine | null;
};

export type PropertiesProps = {
    selectedObject: B3Object | null;
    selectedSubItem?: { parentId: string, type: string, id: string } | null;
    engine: B3Engine | null;
    selectedShaderNode?: any;
    onRender: () => void;
};

export type InspectorProps = {
    objects: B3Object[];
    selectedObject: B3Object | null;
    onSelect: (id: string) => void;
    engine: B3Engine | null;
};

export type ShaderEditorProps = {
    selectedObject: B3Object | null;
    onRender: () => void;
};

export type NodesEditorProps = {
    selectedObject: B3Object | null;
    onRender: () => void;
    engine: B3Engine | null;
};
