import * as webjsx from 'webjsx';

export const MiningPanel = ({ stats }: any) => {
    return (
        <div style="display: flex; padding: 20px; gap: 40px;">
            <div>
                <div style="font-size: 10px; opacity: 0.5; text-transform: uppercase;">Current Hashrate</div>
                <div style="font-size: 32px; font-weight: 800; color: #00d4ff;">{stats.hashrate}</div>
            </div>
            <div>
                <div style="font-size: 10px; opacity: 0.5; text-transform: uppercase;">Accepted Shares</div>
                <div style="font-size: 32px; font-weight: 800; color: #ddd;">{stats.shares}</div>
            </div>
        </div>
    );
};
