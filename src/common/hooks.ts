import { useEffect } from 'react';

export function useOnBeforeUnload(shouldBlock: boolean) {
    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent): void => {
            // Prompt user if he tries to leave while in the middle of a process (searching / unfollowing / etc..)
            // This is especially good for avoiding accidental tab closing which would result in a frustrating experience.
            if (!shouldBlock) {
                return;
            }

            event.preventDefault();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [shouldBlock]);
}
