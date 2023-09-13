import React, { useLayoutEffect, useRef } from 'react';

export function createIcon(svgString: string) {
    return function Icon({ size = 1 }: { readonly size?: number }) {
        const ref = useRef<HTMLSpanElement>(null);
        useLayoutEffect(() => {
            ref.current!.style.fontSize = `${size}em`;
        }, [size]);

        return <span ref={ref} dangerouslySetInnerHTML={{ __html: svgString }} className='is-icon' />;
    };
}
