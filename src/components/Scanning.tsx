import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AppHeader } from './AppHeader';
import { assertUnreachable, sleep, urlGenerator } from '../common/utils';
import { toast } from '../common/toast';
import type { Node, User } from 'model/user';
import { CopyIcon } from '../common/icons/CopyIcon';
import { SearchIcon } from '../common/icons/SearchIcon';
import { CheckSquareIcon } from '../common/icons/CheckSquareIcon';
import { SquareIcon } from '../common/icons/Square';
import { UserCheckIcon } from '../common/icons/UserCheckIcon';
import { UserUncheckIcon } from '../common/icons/UserUncheckIcon';
import { useOnBeforeUnload } from '../hooks/on-before-unload';
import { LockIcon } from '../common/icons/LockIcon';

type Tab = 'non_whitelisted' | 'whitelisted';

interface Filter {
    readonly showNonFollowers: boolean;
    readonly showFollowers: boolean;
    readonly showVerified: boolean;
    readonly showPrivate: boolean;
}

type SearchBar =
    | {
          readonly shown: false;
      }
    | {
          readonly shown: true;
          readonly text: string;
      };

interface State {
    readonly page: number;
    readonly currentTab: Tab;
    readonly searchBar: SearchBar;
    readonly percentage: number;
    readonly results: readonly Node[];
    readonly whitelistedResults: readonly Node[];
    readonly selectedResults: readonly Node[];
    readonly filter: Filter;
}

const UNFOLLOWERS_PER_PAGE = 50;
const WHITELISTED_RESULTS_STORAGE_KEY = 'insta-sweep_whitelisted-results';

async function copyListToClipboard(list: readonly Node[], onCopied: () => void): Promise<void> {
    const sortedList = [...list].sort((a, b) => (a.username > b.username ? 1 : -1));

    let output = '';
    sortedList.forEach(user => {
        output += user.username + '\n';
    });

    await navigator.clipboard.writeText(output);
    onCopied();
}

function getMaxPage(nonFollowersList: readonly Node[]): number {
    const pageCalc = Math.ceil(nonFollowersList.length / UNFOLLOWERS_PER_PAGE);
    return pageCalc < 1 ? 1 : pageCalc;
}

function getCurrentPageUnfollowers(nonFollowersList: readonly Node[], currentPage: number): readonly Node[] {
    const sortedList = [...nonFollowersList].sort((a, b) => (a.username > b.username ? 1 : -1));
    return sortedList.splice(UNFOLLOWERS_PER_PAGE * (currentPage - 1), UNFOLLOWERS_PER_PAGE);
}

function getUsersForDisplay(
    results: readonly Node[],
    whitelistedResults: readonly Node[],
    currentTab: Tab,
    search: SearchBar,
    filter: Filter,
): readonly Node[] {
    const users: Node[] = [];
    for (const result of results) {
        const isWhitelisted = whitelistedResults.find(user => user.id === result.id) !== undefined;
        switch (currentTab) {
            case 'non_whitelisted':
                if (isWhitelisted) {
                    continue;
                }
                break;
            case 'whitelisted':
                if (!isWhitelisted) {
                    continue;
                }
                break;
            default:
                assertUnreachable(currentTab);
        }
        if (!filter.showPrivate && result.is_private) {
            continue;
        }
        if (!filter.showVerified && result.is_verified) {
            continue;
        }
        if (!filter.showFollowers && result.follows_viewer) {
            continue;
        }
        if (!filter.showNonFollowers && !result.follows_viewer) {
            continue;
        }
        if (search.shown) {
            const userMatchesSearchTerm =
                result.username.toLowerCase().includes(search.text.toLowerCase()) ||
                result.full_name.toLowerCase().includes(search.text.toLowerCase());
            if (search.text !== '' && !userMatchesSearchTerm) {
                continue;
            }
        }
        users.push(result);
    }
    return users;
}

export function Scanning({ onUnfollow }: { readonly onUnfollow: (usersToUnfollow: readonly Node[]) => void }) {
    const [state, setState] = useState<State>(() => {
        const whitelistedResultsFromStorage: string | null = localStorage.getItem(WHITELISTED_RESULTS_STORAGE_KEY);
        const whitelistedResults: readonly Node[] =
            whitelistedResultsFromStorage === null ? [] : JSON.parse(whitelistedResultsFromStorage);

        return {
            page: 1,
            currentTab: 'non_whitelisted',
            percentage: 0,
            results: [],
            selectedResults: [],
            whitelistedResults,
            searchBar: {
                shown: false,
            },
            filter: {
                showNonFollowers: true,
                showFollowers: false,
                showVerified: true,
                showPrivate: true,
            },
        };
    });

    const searchInputRef = useRef<HTMLInputElement>(null);

    const usersForDisplay = getUsersForDisplay(
        state.results,
        state.whitelistedResults,
        state.currentTab,
        state.searchBar,
        state.filter,
    );

    useOnBeforeUnload(state.percentage < 100);

    useEffect(() => {
        const scan = async () => {
            const results = [...state.results];
            let scrollCycle = 0;
            let url = urlGenerator();
            let hasNext = true;
            let currentFollowedUsersCount = 0;
            let totalFollowedUsersCount = -1;

            while (hasNext) {
                let receivedData: User;
                try {
                    receivedData = (await fetch(url).then(res => res.json())).data.user.edge_follow;
                } catch (e) {
                    console.error(e);
                    continue;
                }

                if (totalFollowedUsersCount === -1) {
                    totalFollowedUsersCount = receivedData.count;
                }

                hasNext = receivedData.page_info.has_next_page;
                url = urlGenerator(receivedData.page_info.end_cursor);
                currentFollowedUsersCount += receivedData.edges.length;
                receivedData.edges.forEach(x => results.push(x.node));

                setState(prevState => {
                    const newState: State = {
                        ...prevState,
                        percentage: Math.floor((currentFollowedUsersCount / totalFollowedUsersCount) * 100),
                        results,
                    };
                    return newState;
                });

                await sleep(Math.floor(Math.random() * (1000 - 600)) + 1000);
                scrollCycle++;
                if (scrollCycle > 6) {
                    scrollCycle = 0;
                    const timeout = 10 * 1000; // 10 Seconds
                    toast.info('Sleeping 10 secs to prevent getting temp blocked', timeout);
                    await sleep(timeout);
                }
            }
        };
        scan();
        // TODO: Find a way to fix dependency array issue.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleScanFilter = (field: string, currentStatus: boolean) => {
        if (state.selectedResults.length > 0) {
            if (!confirm('Changing filter options will clear selected users')) {
                // Force re-render. Bit of a hack but had an issue where the checkbox state was still
                // changing in the UI even when not confirming. So updating the state fixes this
                // by synchronizing the checkboxes with the filter statuses in the state.
                setState({ ...state });
                return;
            }
        }
        setState({
            ...state,
            // Make sure to clear selected results when changing filter options. This is to avoid having
            // users selected in the unfollow queue but not visible in the UI, which would be confusing.
            selectedResults: [],
            filter: {
                ...state.filter,
                [field]: !currentStatus,
            },
        });
    };

    const isUserSelected = (user: Node): boolean => state.selectedResults.indexOf(user) !== -1;

    const toggleUser = (user: Node) => {
        if (isUserSelected(user)) {
            setState({
                ...state,
                selectedResults: state.selectedResults.filter(result => result.id !== user.id),
            });
        } else {
            setState({
                ...state,
                selectedResults: [...state.selectedResults, user],
            });
        }
    };

    const isAllUsersSelected = useCallback((): boolean => {
        if (state.selectedResults.length === 0) {
            return false;
        }
        return state.selectedResults.length === usersForDisplay.length;
    }, [state.selectedResults.length, usersForDisplay.length]);

    const toggleAllUsers = useCallback(() => {
        // Avoid allowing to select all before scan completed to avoid confusion
        // regarding what exactly is selected while scanning in progress.
        if (state.percentage < 100) {
            toast.info('Please wait until the scanning process is done');
            return;
        }
        if (!isAllUsersSelected()) {
            setState({
                ...state,
                selectedResults: usersForDisplay,
            });
        } else {
            setState({
                ...state,
                selectedResults: [],
            });
        }
    }, [isAllUsersSelected, state, usersForDisplay]);

    const toggleAllUsersThatStartWithLetter = (letter: string) => {
        // Avoid allowing to select all before scan completed to avoid confusion
        // regarding what exactly is selected while scanning in progress.
        if (state.percentage < 100) {
            toast.info('Please wait until the scanning process is done');
            return;
        }
        const allDisplayedUsersThatStartWithLetter = usersForDisplay.filter(result => {
            const userFirstLetter = result.username.substring(0, 1).toUpperCase();
            return userFirstLetter === letter.toUpperCase();
        });
        const allSelectedUsersThatStartWithLetter = state.selectedResults.filter(result => {
            const userFirstLetter = result.username.substring(0, 1).toUpperCase();
            return userFirstLetter === letter.toUpperCase();
        });
        if (allDisplayedUsersThatStartWithLetter.length === allSelectedUsersThatStartWithLetter.length) {
            setState({
                ...state,
                selectedResults: state.selectedResults.filter(
                    user => allSelectedUsersThatStartWithLetter.indexOf(user) === -1,
                ),
            });
            return;
        }
        const selectedResults = [
            ...state.selectedResults,
            ...allDisplayedUsersThatStartWithLetter.filter(
                result =>
                    // Avoid duplicates
                    state.selectedResults.indexOf(result) === -1,
            ),
        ];
        setState({ ...state, selectedResults });
    };

    const toggleSearchBar = useCallback(() => {
        if (state.searchBar.shown) {
            setState({
                ...state,
                searchBar: {
                    shown: false,
                },
            });
        } else {
            setState({
                ...state,
                searchBar: {
                    shown: true,
                    text: '',
                },
            });

            if (searchInputRef.current !== null) {
                searchInputRef.current.focus();
            }
        }
    }, [state]);

    const changePage = useCallback(
        (direction: 'forwards' | 'backwards') => {
            switch (direction) {
                case 'forwards': {
                    const isLastPage = state.page === getMaxPage(usersForDisplay);
                    if (isLastPage) {
                        return;
                    }
                    setState({ ...state, page: state.page + 1 });
                    break;
                }

                case 'backwards': {
                    const isFirstPage = state.page === 1;
                    if (isFirstPage) {
                        return;
                    }
                    setState({ ...state, page: state.page - 1 });
                    break;
                }

                default:
                    assertUnreachable(direction);
            }
        },
        [state, usersForDisplay],
    );

    let currentLetter = '';
    const onNewLetter = (firstLetter: string) => {
        currentLetter = firstLetter;
        return (
            <button
                className='alphabet-character'
                onClick={e => toggleAllUsersThatStartWithLetter(e.currentTarget.innerText)}
            >
                {currentLetter}
            </button>
        );
    };

    const onListCopiedToClipboard = () => toast.success('User list copied to clipboard');

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                changePage('forwards');
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                changePage('backwards');
            }
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                toggleAllUsers();
            }
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                copyListToClipboard(state.selectedResults, onListCopiedToClipboard);
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                toggleSearchBar();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [changePage, toggleAllUsers, toggleSearchBar, state.selectedResults]);

    return (
        <div className='scanning'>
            <AppHeader isActiveProcess={state.percentage < 100}>
                <button
                    title='Copy user list (CTRL+C)'
                    onClick={() => copyListToClipboard(state.selectedResults, onListCopiedToClipboard)}
                >
                    <CopyIcon size={2} />
                </button>
                <input
                    type='text'
                    ref={searchInputRef}
                    className={`search-bar ${state.searchBar.shown ? 'visible' : ''}`}
                    placeholder='Search...'
                    value={state.searchBar.shown ? state.searchBar.text : undefined}
                    onChange={e => {
                        if (!state.searchBar.shown) {
                            return;
                        }
                        setState({
                            ...state,
                            searchBar: {
                                ...state.searchBar,
                                text: e.currentTarget.value,
                            },
                        });
                    }}
                />
                <button title='Search user list (CTRL+S)' onClick={toggleSearchBar}>
                    <SearchIcon size={2} />
                </button>
                <button title='Select all (CTRL+A)' onClick={toggleAllUsers}>
                    {isAllUsersSelected() ? <CheckSquareIcon size={2} /> : <SquareIcon size={2} />}
                </button>
            </AppHeader>
            {state.percentage < 100 && <progress className='progressbar' value={state.percentage} max='100' />}

            <section className='flex'>
                <aside className='app-sidebar'>
                    <menu className='flex column m-clear p-clear'>
                        <p>Filter</p>
                        <button
                            name='showNonFollowers'
                            onClick={e => handleScanFilter(e.currentTarget.name, state.filter.showNonFollowers)}
                            className={`filter-toggle ${state.filter.showNonFollowers ? 'bg-brand' : ''}`}
                        >
                            Non-Followers
                        </button>
                        <button
                            name='showFollowers'
                            onClick={e => handleScanFilter(e.currentTarget.name, state.filter.showFollowers)}
                            className={`filter-toggle ${state.filter.showFollowers ? 'bg-brand' : ''}`}
                        >
                            Followers
                        </button>
                        <button
                            name='showVerified'
                            onClick={e => handleScanFilter(e.currentTarget.name, state.filter.showVerified)}
                            className={`filter-toggle ${state.filter.showVerified ? 'bg-brand' : ''}`}
                        >
                            Verified
                        </button>
                        <button
                            name='showPrivate'
                            onClick={e => handleScanFilter(e.currentTarget.name, state.filter.showPrivate)}
                            className={`filter-toggle ${state.filter.showPrivate ? 'bg-brand' : ''}`}
                        >
                            Private
                        </button>
                    </menu>
                    <div className='grow'>
                        <p>Displayed: {usersForDisplay.length}</p>
                        <p>Total: {state.results.length}</p>
                    </div>

                    <div className='grow t-center'>
                        <p>Pages</p>
                        <a
                            title='Previous page (Left arrow)'
                            onClick={() => changePage('backwards')}
                            className='p-medium'
                        >
                            ❮
                        </a>
                        <span>
                            {state.page}
                            &nbsp;/&nbsp;
                            {getMaxPage(usersForDisplay)}
                        </span>
                        <a title='Next page (Right arrow)' onClick={() => changePage('forwards')} className='p-medium'>
                            ❯
                        </a>
                    </div>
                    <button
                        className='unfollow-action'
                        onClick={() => {
                            if (!confirm('Are you sure?')) {
                                return;
                            }
                            if (state.selectedResults.length === 0) {
                                toast.error('Must select at least a single user to unfollow');
                                return;
                            }
                            onUnfollow(state.selectedResults);
                        }}
                    >
                        UNFOLLOW ({state.selectedResults.length})
                    </button>
                </aside>
                <article className='results-container'>
                    <nav className='tabs-container'>
                        <div
                            className={`tab ${state.currentTab === 'non_whitelisted' ? 'tab-active' : ''}`}
                            onClick={() => {
                                if (state.currentTab === 'non_whitelisted') {
                                    return;
                                }
                                setState({
                                    ...state,
                                    currentTab: 'non_whitelisted',
                                    selectedResults: [],
                                });
                            }}
                        >
                            Non-Whitelisted
                        </div>
                        <div
                            className={`tab ${state.currentTab === 'whitelisted' ? 'tab-active' : ''}`}
                            onClick={() => {
                                if (state.currentTab === 'whitelisted') {
                                    return;
                                }
                                setState({
                                    ...state,
                                    currentTab: 'whitelisted',
                                    selectedResults: [],
                                });
                            }}
                        >
                            Whitelisted
                        </div>
                    </nav>
                    {getCurrentPageUnfollowers(usersForDisplay, state.page).map(user => {
                        const firstLetter = user.username.substring(0, 1).toUpperCase();
                        return (
                            <>
                                {firstLetter !== currentLetter && onNewLetter(firstLetter)}
                                <button
                                    className={`result-item ${isUserSelected(user) ? 'bg-brand' : ''}`}
                                    onClick={() => toggleUser(user)}
                                >
                                    <div className='flex align-center m-medium'>
                                        <div
                                            className='avatar-container'
                                            onClick={e => {
                                                // Prevent selecting result when trying to add to whitelist.
                                                e.preventDefault();
                                                e.stopPropagation();
                                                let whitelistedResults: readonly Node[] = [];
                                                switch (state.currentTab) {
                                                    case 'non_whitelisted':
                                                        whitelistedResults = [...state.whitelistedResults, user];
                                                        break;

                                                    case 'whitelisted':
                                                        whitelistedResults = state.whitelistedResults.filter(
                                                            result => result.id !== user.id,
                                                        );
                                                        break;

                                                    default:
                                                        assertUnreachable(state.currentTab);
                                                }
                                                localStorage.setItem(
                                                    WHITELISTED_RESULTS_STORAGE_KEY,
                                                    JSON.stringify(whitelistedResults),
                                                );
                                                setState({ ...state, whitelistedResults });
                                            }}
                                        >
                                            <img className='avatar' alt={user.username} src={user.profile_pic_url} />
                                            <span className='avatar-icon-overlay-container'>
                                                {state.currentTab === 'non_whitelisted' ? (
                                                    <UserCheckIcon size={2} />
                                                ) : (
                                                    <UserUncheckIcon size={2} />
                                                )}
                                            </span>
                                        </div>
                                        <div className='flex column m-medium'>
                                            <a
                                                className='fs-xlarge'
                                                target='_blank'
                                                href={`../${user.username}`}
                                                rel='noreferrer'
                                            >
                                                {user.username}
                                            </a>
                                            <span className='fs-medium'>{user.full_name}</span>
                                        </div>
                                        {user.is_verified && (
                                            <div title='Verified' className='verified-badge'>
                                                ✔
                                            </div>
                                        )}
                                        {user.is_private && (
                                            <span title='Private' className='private-indicator'>
                                                <LockIcon size={1.8} />
                                            </span>
                                        )}
                                        <div className='grow' />
                                        <div>
                                            <div>
                                                Follows you:&nbsp;
                                                {user.follows_viewer ? (
                                                    <span className='fs-medium clr-success'>✔</span>
                                                ) : (
                                                    <span className='fs-medium clr-error'>&#120;</span>
                                                )}
                                            </div>
                                            <div>
                                                Followed by you:&nbsp;
                                                {user.followed_by_viewer ? (
                                                    <span className='fs-medium clr-success'>✔</span>
                                                ) : (
                                                    <span className='fs-medium clr-error'>&#120;</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </>
                        );
                    })}
                </article>
            </section>
        </div>
    );
}
