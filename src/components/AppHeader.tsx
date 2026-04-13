import React, { type ReactNode } from 'react';

import { InstaSweepIcon } from '../common/icons/InstaSweepIcon';

export function AppHeader({
    isActiveProcess,
    children,
}: {
    readonly isActiveProcess?: boolean;
    readonly children?: ReactNode;
}) {
    return (
        <header className='app-header'>
            <div className='app-header-content'>
                <button
                    type='button'
                    className='logo'
                    onClick={() => {
                        if (isActiveProcess) {
                            // Avoid resetting state while active process.
                            return;
                        }
                        if (confirm('Go back to Instagram?')) {
                            location.reload();
                        }
                    }}
                >
                    <InstaSweepIcon />
                    &nbsp;
                    <span>InstaSweep</span>
                </button>
                <nav className='header-nav'>{children}</nav>
            </div>
        </header>
    );
}
