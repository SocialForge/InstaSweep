import React, { useEffect } from 'react';

import { AppHeader } from './AppHeader';

export function Initial({ onScan }: { readonly onScan: () => void }) {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Enter':
                    onScan();
                    break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onScan]);

    return (
        <div className='initial'>
            <AppHeader isActiveProcess={false} />
            <button className='main-action' onClick={onScan}>
                <strong className='main-action-text'>Click anywhere to run</strong>
            </button>
        </div>
    );
}
