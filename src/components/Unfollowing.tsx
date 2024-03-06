import React, { useEffect, useMemo, useState } from 'react';

import { AppHeader } from './AppHeader';
import { sleep } from '../common/utils';
import { toast } from '../common/toast';
import type { Node } from 'model/user';
import { useOnBeforeUnload } from '../common/hooks';
import { InstagramService } from '../common/services';

interface Filter {
    readonly showSucceeded: boolean;
    readonly showFailed: boolean;
}

interface LogEntry {
    readonly user: Node;
    readonly unfollowedSuccessfully: boolean;
}

interface State {
    readonly searchTerm: string;
    readonly percentage: number;
    readonly unfollowLog: readonly LogEntry[];
    readonly filter: Filter;
}

function getLogForDisplay(log: readonly LogEntry[], searchTerm: string, filter: Filter) {
    const entries: LogEntry[] = [];
    for (const entry of log) {
        if (!filter.showSucceeded && entry.unfollowedSuccessfully) {
            continue;
        }
        if (!filter.showFailed && !entry.unfollowedSuccessfully) {
            continue;
        }
        const userMatchesSearchTerm = entry.user.username.toLowerCase().includes(searchTerm.toLowerCase());
        if (searchTerm !== '' && !userMatchesSearchTerm) {
            continue;
        }
        entries.push(entry);
    }
    return entries;
}

export function Unfollowing({ usersToUnfollow }: { readonly usersToUnfollow: readonly Node[] }) {
    const [state, setState] = useState<State>({
        searchTerm: '',
        percentage: 0,
        unfollowLog: [],
        filter: {
            showSucceeded: true,
            showFailed: true,
        },
    });

    const instagramService = useMemo(() => new InstagramService(), []);

    const isActiveProcess = state.percentage < 100;
    useOnBeforeUnload(isActiveProcess);

    useEffect(() => {
        const unfollow = async () => {
            let counter = 0;
            for (const user of usersToUnfollow) {
                counter += 1;
                const percentage = Math.floor((counter / usersToUnfollow.length) * 100);
                try {
                    await instagramService.unfollow(user.id);
                    setState(prevState => {
                        const newState: State = {
                            ...prevState,
                            percentage,
                            unfollowLog: [
                                ...prevState.unfollowLog,
                                {
                                    user,
                                    unfollowedSuccessfully: true,
                                },
                            ],
                        };
                        return newState;
                    });
                } catch (e) {
                    console.error(e);
                    setState(prevState => {
                        const newState: State = {
                            ...prevState,
                            percentage,
                            unfollowLog: [
                                ...prevState.unfollowLog,
                                {
                                    user,
                                    unfollowedSuccessfully: false,
                                },
                            ],
                        };
                        return newState;
                    });
                }
                // If unfollowing the last user in the list, no reason to wait.
                if (user === usersToUnfollow[usersToUnfollow.length - 1]) {
                    break;
                }
                await sleep(Math.floor(Math.random() * (6000 - 4000)) + 4000);

                if (counter % 5 === 0) {
                    const timeout = 5 * 60 * 1000; // 5 Minutes
                    toast.info('Sleeping 5 minutes to prevent getting temp blocked', timeout);
                    await sleep(timeout);
                }
            }
        };
        unfollow();
    }, [instagramService, usersToUnfollow]);

    const handleFilter = (field: string, currentStatus: boolean) => {
        setState({
            ...state,
            filter: {
                ...state.filter,
                [field]: !currentStatus,
            },
        });
    };

    return (
        <div className='unfollowing'>
            <AppHeader isActiveProcess={isActiveProcess} />
            {isActiveProcess && <progress className='progressbar' value={state.percentage} max='100' />}

            <section className='flex'>
                <aside className='app-sidebar'>
                    <menu className='flex column grow m-clear p-clear'>
                        <p>Filter</p>
                        <button
                            name='showSucceeded'
                            className={`filter-toggle ${state.filter.showSucceeded ? 'bg-brand' : ''}`}
                            onChange={e => handleFilter(e.currentTarget.name, state.filter.showSucceeded)}
                        >
                            Succeeded
                        </button>
                        <button
                            name='showFailed'
                            className={`filter-toggle ${state.filter.showFailed ? 'bg-brand' : ''}`}
                            onChange={e => handleFilter(e.currentTarget.name, state.filter.showFailed)}
                        >
                            Failed
                        </button>
                    </menu>
                </aside>
                <article className='unfollow-log-container'>
                    {state.unfollowLog.length === usersToUnfollow.length && (
                        <>
                            <hr />
                            <div className='fs-large p-medium clr-success'>All DONE!</div>
                            <hr />
                        </>
                    )}
                    {getLogForDisplay(state.unfollowLog, state.searchTerm, state.filter).map((entry, index) =>
                        entry.unfollowedSuccessfully ? (
                            <div className='p-medium' key={entry.user.id}>
                                Unfollowed
                                <a
                                    className='clr-inherit'
                                    target='_blank'
                                    href={`../${entry.user.username}`}
                                    rel='noreferrer'
                                >
                                    &nbsp;{entry.user.username}
                                </a>
                                <span className='clr-cyan'>
                                    &nbsp; [{index + 1}/{usersToUnfollow.length}]
                                </span>
                            </div>
                        ) : (
                            <div className='p-medium clr-error' key={entry.user.id}>
                                Failed to unfollow {entry.user.username} [{index + 1}/{usersToUnfollow.length}]
                            </div>
                        ),
                    )}
                </article>
            </section>
        </div>
    );
}
