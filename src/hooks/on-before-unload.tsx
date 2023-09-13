import { useEffect } from 'react';

export function useOnBeforeUnload(shouldBlock: boolean) {
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            // Prompt user if he tries to leave while in the middle of a process (searching / unfollowing / etc..)
            // This is especially good for avoiding accidental tab closing which would result in a frustrating experience.
            if (!shouldBlock) {
                return;
            }

            // `e` Might be undefined in older browsers, so silence linter for this one.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            e = e || window.event;

            // `e` Might be undefined in older browsers, so silence linter for this one.
            // For IE and Firefox prior to version 4
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (e) {
                e.returnValue = 'Changes you made may not be saved.';
            }

            // For Safari
            return 'Changes you made may not be saved.';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [shouldBlock]);
}
