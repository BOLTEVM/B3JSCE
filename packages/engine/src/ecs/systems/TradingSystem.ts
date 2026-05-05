import { SystemDefinition } from '../System';

export interface TradingAgentComponent {
    _type: 'TradingAgent';
    role: string; // e.g. "Analyst", "Researcher", "Portfolio Manager"
    isSpeaking: boolean;
    lastMessage: string;
}

export const TradingSystem: SystemDefinition = {
    name: 'TradingSystem',
    requiredComponents: ['TradingAgent'],
    priority: 60,
    execute: (world, dt) => {
        const engine = (world as any)._engineRef;
        if (!engine) return;

        const store = world.getStore<TradingAgentComponent>('TradingAgent');

        world.query(['TradingAgent']).forEach(entityId => {
            const agent = store.get(entityId);
            if (!agent) return;

            const b3obj = engine.objects.find((o: any) => o.ecsEntityId === entityId);
            if (!b3obj) return;

            // Visual logic based on the agent state
            if (agent.isSpeaking) {
                // E.g. pulse an aura around the 3D avatar
                if (b3obj.mesh && b3obj.mesh.material) {
                    // Quick highlight effect assuming a mesh is present
                    const intensity = (Math.sin(Date.now() / 150) * 0.5) + 0.5;
                    if (b3obj.mesh.material.emissive) {
                        b3obj.mesh.material.emissive.setHex(0x00ff00);
                        b3obj.mesh.material.emissiveIntensity = intensity;
                    }
                }
            } else {
                if (b3obj.mesh && b3obj.mesh.material && b3obj.mesh.material.emissiveIntensity) {
                    b3obj.mesh.material.emissiveIntensity = 0;
                }
            }
        });
    }
};
