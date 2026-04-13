import React, { type ReactNode, useState } from 'react';
import { render } from 'preact';
import './styles.scss';

import { assertUnreachable } from './common/utils';
import { Initial } from './components/Initial';
import { Scanning } from './components/Scanning';
import { Unfollowing } from './components/Unfollowing';
import type { Node } from './model/user';

const INSTAGRAM_HOSTNAME = 'www.instagram.com';

type State =
    | { readonly status: 'initial' }
    | { readonly status: 'scanning' }
    | {
          readonly status: 'unfollowing';
          readonly usersToUnfollow: readonly Node[];
      };

function App() {
    const [state, setState] = useState<State>({ status: 'initial' });

    let markup: ReactNode;
    switch (state.status) {
        case 'initial':
            markup = (
                <Initial
                    onScan={() => {
                        setState({ status: 'scanning' });
                    }}
                />
            );
            break;

        case 'scanning':
            markup = (
                <Scanning
                    onUnfollow={usersToUnfollow => {
                        setState({ status: 'unfollowing', usersToUnfollow });
                    }}
                />
            );
            break;

        case 'unfollowing':
            markup = <Unfollowing usersToUnfollow={state.usersToUnfollow} />;
            break;

        default:
            assertUnreachable(state);
    }

    return (
        <main id='main' role='main' className='is-app'>
            <section className='overlay'>{markup}</section>
        </main>
    );
}

if (location.hostname !== INSTAGRAM_HOSTNAME) {
    alert('Can be used only on Instagram routes');
} else {
    document.title = 'InstaSweep';
    document.body.replaceChildren();
    render(<App />, document.body);
}
