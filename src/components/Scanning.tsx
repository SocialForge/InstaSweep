import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppHeader } from './AppHeader';
import { assertUnreachable, sleep } from '../common/utils';
import { toast } from '../common/toast';
import type { Node, User } from '../model/user';
import { CopyIcon } from '../common/icons/CopyIcon';
import { SearchIcon } from '../common/icons/SearchIcon';
import { CheckSquareIcon } from '../common/icons/CheckSquareIcon';
import { SquareIcon } from '../common/icons/SquareIcon';
import { UserCheckIcon } from '../common/icons/UserCheckIcon';
import { UserUncheckIcon } from '../common/icons/UserUncheckIcon';
import { useOnBeforeUnload } from '../common/hooks';
import { LockIcon } from '../common/icons/LockIcon';
import { InstagramService } from '../common/services';

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

function dedupeUsersById(users: readonly Node[]): readonly Node[] {
    const seenUserIds = new Set<string>();
    const dedupedUsers: Node[] = [];

    for (const user of users) {
        if (seenUserIds.has(user.id)) {
            continue;
        }

        seenUserIds.add(user.id);
        dedupedUsers.push(user);
    }

    return dedupedUsers;
}

function loadWhitelistedResults(): readonly Node[] {
    const whitelistedResultsFromStorage = localStorage.getItem(WHITELISTED_RESULTS_STORAGE_KEY);
    if (whitelistedResultsFromStorage === null) {
        return [];
    }

    try {
        const parsedWhitelistedResults: unknown = JSON.parse(whitelistedResultsFromStorage);
        if (!Array.isArray(parsedWhitelistedResults)) {
            return [];
        }

        return dedupeUsersById(parsedWhitelistedResults as readonly Node[]);
    } catch (error) {
        console.error(error);
        localStorage.removeItem(WHITELISTED_RESULTS_STORAGE_KEY);
        return [];
    }
}

function getMaxPage(nonFollowersList: readonly Node[]): number {
    const pageCalc = Math.ceil(nonFollowersList.length / UNFOLLOWERS_PER_PAGE);
    return Math.max(1, pageCalc);
}

function getCurrentPageUnfollowers(
    nonFollowersList: readonly Node[],
    currentPage: number,
): readonly Node[] {
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
        const isWhitelisted = whitelistedResults.some(user => user.id === result.id);
        switch (currentTab) {
            case 'non_whitelisted': {
                if (isWhitelisted) {
                    continue;
                }
                break;
            }

            case 'whitelisted': {
                if (!isWhitelisted) {
                    continue;
                }
                break;
            }

            default: {
                assertUnreachable(currentTab);
            }
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

export function Scanning({
    onUnfollow,
}: {
    readonly onUnfollow: (usersToUnfollow: readonly Node[]) => void;
}) {
    const [state, setState] = useState<State>(() => {
        return {
            page: 1,
            currentTab: 'non_whitelisted',
            percentage: 0,
            results: [],
            selectedResults: [],
            whitelistedResults: loadWhitelistedResults(),
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

    const instagramService = useMemo(() => new InstagramService(), []);

    const searchInputRef = useRef<HTMLInputElement>(null);

    const usersForDisplay = getUsersForDisplay(
        state.results,
        state.whitelistedResults,
        state.currentTab,
        state.searchBar,
        state.filter,
    );

    const isActiveProcess = state.percentage < 100;
    useOnBeforeUnload(isActiveProcess);

    const pagedUsers = getCurrentPageUnfollowers(usersForDisplay, state.page);

    useEffect(() => {
        localStorage.setItem(
            WHITELISTED_RESULTS_STORAGE_KEY,
            JSON.stringify(state.whitelistedResults),
        );
    }, [state.whitelistedResults]);

    useEffect(() => {
        const maxPage = getMaxPage(usersForDisplay);
        if (state.page <= maxPage) {
            return;
        }

        setState(prev => ({ ...prev, page: maxPage }));
    }, [state.page, usersForDisplay]);

    useEffect(() => {
        const scan = async () => {
            const results: Node[] = [];
            let scrollCycle = 0;
            let hasNext = true;
            let currentFollowedUsersCount = 0;
            let totalFollowedUsersCount = -1;

            while (hasNext) {
                let receivedData: User;
                try {
                    receivedData = await instagramService.getNextUser();
                } catch (error) {
                    console.error(error);
                    continue;
                }

                if (totalFollowedUsersCount === -1) {
                    totalFollowedUsersCount = receivedData.count;
                }

                hasNext = receivedData.page_info.has_next_page;
                currentFollowedUsersCount += receivedData.edges.length;
                for (const edge of receivedData.edges) {
                    results.push(edge.node);
                }

                setState(prevState => {
                    const newState: State = {
                        ...prevState,
                        percentage: Math.floor(
                            (currentFollowedUsersCount / totalFollowedUsersCount) * 100,
                        ),
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
        void scan();
        // TODO: Find a way to fix dependency array issue.
    }, [instagramService]);

    const handleFilter = (field: string, currentStatus: boolean) => {
        if (
            state.selectedResults.length > 0 &&
            !confirm('Changing filter options will clear selected users')
        ) {
            return;
        }
        setState({
            ...state,
            // Clear selected results when changing filter options to avoid having users selected
            // in the unfollow queue but not visible in the UI, which would be confusing.
            selectedResults: [],
            page: 1,
            filter: {
                ...state.filter,
                [field]: !currentStatus,
            },
        });
    };

    const copyListToClipboard = useCallback(async (): Promise<void> => {
        if (state.selectedResults.length === 0) {
            toast.error('Must select at least a single user for this action');
            return;
        }
        const sortedResults = [...state.selectedResults].sort((a, b) =>
            a.username > b.username ? 1 : -1,
        );

        let output = '';
        for (const user of sortedResults) {
            output += user.username + '\n';
        }

        await navigator.clipboard.writeText(output);
        toast.success('User list copied to clipboard');
    }, [state.selectedResults]);

    const isUserSelected = (user: Node): boolean => state.selectedResults.includes(user);

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
        if (isActiveProcess) {
            toast.info('Please wait until the scanning process is done');
            return;
        }
        setState(prev => {
            const newState: State = {
                ...prev,
                selectedResults: isAllUsersSelected() ? [] : usersForDisplay,
            };
            return newState;
        });
    }, [isAllUsersSelected, usersForDisplay, isActiveProcess]);

    const toggleAllUsersThatStartWithLetter = (letter: string) => {
        // Avoid allowing to select all before scan completed to avoid confusion
        // regarding what exactly is selected while scanning in progress.
        if (isActiveProcess) {
            toast.info('Please wait until the scanning process is done');
            return;
        }
        const allDisplayedUsersThatStartWithLetter = usersForDisplay.filter(result => {
            const userFirstLetter = result.username.slice(0, 1).toUpperCase();
            return userFirstLetter === letter.toUpperCase();
        });
        const allSelectedUsersThatStartWithLetter = state.selectedResults.filter(result => {
            const userFirstLetter = result.username.slice(0, 1).toUpperCase();
            return userFirstLetter === letter.toUpperCase();
        });
        if (
            allDisplayedUsersThatStartWithLetter.length ===
            allSelectedUsersThatStartWithLetter.length
        ) {
            setState({
                ...state,
                selectedResults: state.selectedResults.filter(
                    user => !allSelectedUsersThatStartWithLetter.includes(user),
                ),
            });
            return;
        }
        const selectedResults = [
            ...state.selectedResults,
            ...allDisplayedUsersThatStartWithLetter.filter(
                result =>
                    // Avoid duplicates
                    !state.selectedResults.includes(result),
            ),
        ];
        setState({ ...state, selectedResults });
    };

    const toggleSearchBar = useCallback(() => {
        setState(prev => {
            const searchBar: SearchBar = prev.searchBar.shown
                ? {
                      shown: false,
                  }
                : {
                      shown: true,
                      text: '',
                  };
            const newState: State = {
                ...prev,
                searchBar,
            };
            return newState;
        });

        if (searchInputRef.current !== null) {
            searchInputRef.current.focus();
        }
    }, []);

    const changePage = useCallback(
        (direction: 'forwards' | 'backwards') => {
            setState(prev => {
                let newState: State;
                switch (direction) {
                    case 'forwards': {
                        const isLastPage = prev.page === getMaxPage(usersForDisplay);
                        if (isLastPage) {
                            return prev;
                        }
                        newState = { ...prev, page: prev.page + 1 };
                        break;
                    }

                    case 'backwards': {
                        const isFirstPage = prev.page === 1;
                        if (isFirstPage) {
                            return prev;
                        }
                        newState = { ...prev, page: prev.page - 1 };
                        break;
                    }

                    default: {
                        assertUnreachable(direction);
                    }
                }
                return newState;
            });
        },
        [usersForDisplay],
    );

    const changeTab = useCallback((tab: Tab) => {
        setState(prev => {
            if (prev.currentTab === tab) {
                return prev;
            }
            const newState: State = {
                ...prev,
                currentTab: tab,
                page: 1,
                selectedResults: [],
            };
            return newState;
        });
    }, []);

    const toggleUserWhitelistStatus = (user: Node) => {
        setState(prev => {
            switch (prev.currentTab) {
                case 'non_whitelisted': {
                    return {
                        ...prev,
                        page: 1,
                        selectedResults: prev.selectedResults.filter(
                            result => result.id !== user.id,
                        ),
                        whitelistedResults: dedupeUsersById([...prev.whitelistedResults, user]),
                    };
                }

                case 'whitelisted': {
                    return {
                        ...prev,
                        page: 1,
                        selectedResults: prev.selectedResults.filter(
                            result => result.id !== user.id,
                        ),
                        whitelistedResults: prev.whitelistedResults.filter(
                            result => result.id !== user.id,
                        ),
                    };
                }

                default: {
                    assertUnreachable(prev.currentTab);
                }
            }
        });
    };

    const toggleSelectedUsersWhitelistStatus = useCallback(() => {
        setState(prev => {
            if (prev.selectedResults.length === 0) {
                toast.error('Must select at least a single user for this action');
                return prev;
            }

            switch (prev.currentTab) {
                case 'non_whitelisted': {
                    return {
                        ...prev,
                        page: 1,
                        selectedResults: [],
                        whitelistedResults: dedupeUsersById([
                            ...prev.whitelistedResults,
                            ...prev.selectedResults,
                        ]),
                    };
                }

                case 'whitelisted': {
                    const selectedUserIds = new Set(prev.selectedResults.map(result => result.id));

                    return {
                        ...prev,
                        page: 1,
                        selectedResults: [],
                        whitelistedResults: prev.whitelistedResults.filter(
                            result => !selectedUserIds.has(result.id),
                        ),
                    };
                }

                default: {
                    assertUnreachable(prev.currentTab);
                }
            }
        });
    }, []);

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
            if (e.key === 'Tab') {
                e.preventDefault();
                switch (state.currentTab) {
                    case 'non_whitelisted': {
                        changeTab('whitelisted');
                        break;
                    }

                    case 'whitelisted': {
                        changeTab('non_whitelisted');
                        break;
                    }

                    default: {
                        assertUnreachable(state.currentTab);
                    }
                }
            }
            if (e.ctrlKey && e.key === 'a' && !state.searchBar.shown) {
                e.preventDefault();
                toggleAllUsers();
            }
            if (e.ctrlKey && e.key === 'c' && !state.searchBar.shown) {
                e.preventDefault();
                void copyListToClipboard();
            }
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                toggleSearchBar();
            }
            if (e.ctrlKey && e.key === 'x') {
                e.preventDefault();
                toggleSelectedUsersWhitelistStatus();
            }
            if (e.key === 'Escape' && state.searchBar.shown) {
                // Close search bar on ESC.
                e.preventDefault();
                toggleSearchBar();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [
        changePage,
        toggleAllUsers,
        toggleSearchBar,
        state.selectedResults,
        state.searchBar.shown,
        state.currentTab,
        changeTab,
        copyListToClipboard,
        toggleSelectedUsersWhitelistStatus,
    ]);

    let whitelistButtonMarkup: React.JSX.Element;
    switch (state.currentTab) {
        case 'non_whitelisted': {
            whitelistButtonMarkup = (
                <button
                    type='button'
                    title='Add selected users to whitelist (CTRL+X)'
                    onClick={toggleSelectedUsersWhitelistStatus}
                >
                    <UserCheckIcon size={2} />
                </button>
            );
            break;
        }

        case 'whitelisted': {
            whitelistButtonMarkup = (
                <button
                    type='button'
                    title='Remove selected users from whitelist (CTRL+X)'
                    onClick={toggleSelectedUsersWhitelistStatus}
                >
                    <UserUncheckIcon size={2} />
                </button>
            );
            break;
        }

        default: {
            assertUnreachable(state.currentTab);
        }
    }

    return (
        <div className='scanning'>
            <AppHeader isActiveProcess={isActiveProcess}>
                {whitelistButtonMarkup}
                <button type='button' title='Copy user list (CTRL+C)' onClick={copyListToClipboard}>
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
                <button type='button' title='Search user list (CTRL+S)' onClick={toggleSearchBar}>
                    <SearchIcon size={2} />
                </button>
                <button type='button' title='Select all (CTRL+A)' onClick={toggleAllUsers}>
                    {isAllUsersSelected() ? <CheckSquareIcon size={2} /> : <SquareIcon size={2} />}
                </button>
            </AppHeader>
            {isActiveProcess && (
                <progress className='progressbar' value={state.percentage} max='100' />
            )}

            <section className='flex'>
                <aside className='app-sidebar'>
                    <menu className='flex column m-clear p-clear'>
                        <p>Filter</p>
                        <button
                            name='showNonFollowers'
                            onClick={e =>
                                handleFilter(e.currentTarget.name, state.filter.showNonFollowers)
                            }
                            className={`filter-toggle ${state.filter.showNonFollowers ? 'bg-brand' : ''}`}
                        >
                            Non-Followers
                        </button>
                        <button
                            name='showFollowers'
                            onClick={e =>
                                handleFilter(e.currentTarget.name, state.filter.showFollowers)
                            }
                            className={`filter-toggle ${state.filter.showFollowers ? 'bg-brand' : ''}`}
                        >
                            Followers
                        </button>
                        <button
                            name='showVerified'
                            onClick={e =>
                                handleFilter(e.currentTarget.name, state.filter.showVerified)
                            }
                            className={`filter-toggle ${state.filter.showVerified ? 'bg-brand' : ''}`}
                        >
                            Verified
                        </button>
                        <button
                            name='showPrivate'
                            onClick={e =>
                                handleFilter(e.currentTarget.name, state.filter.showPrivate)
                            }
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
                        <button
                            type='button'
                            title='Previous page (Left arrow)'
                            onClick={() => changePage('backwards')}
                            className='p-medium'
                        >
                            ❮
                        </button>
                        <span>
                            {state.page}
                            &nbsp;/&nbsp;
                            {getMaxPage(usersForDisplay)}
                        </span>
                        <button
                            type='button'
                            title='Next page (Right arrow)'
                            onClick={() => changePage('forwards')}
                            className='p-medium'
                        >
                            ❯
                        </button>
                    </div>
                    <button
                        type='button'
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
                        <button
                            type='button'
                            className={`tab ${state.currentTab === 'non_whitelisted' ? 'tab-active' : ''}`}
                            title='Non-whitelisted tab (TAB)'
                            onClick={() => changeTab('non_whitelisted')}
                        >
                            Non-Whitelisted
                        </button>
                        <button
                            type='button'
                            className={`tab ${state.currentTab === 'whitelisted' ? 'tab-active' : ''}`}
                            title='Whitelisted tab (TAB)'
                            onClick={() => changeTab('whitelisted')}
                        >
                            Whitelisted
                        </button>
                    </nav>
                    {pagedUsers.map((user, index) => {
                        const firstLetter = user.username.slice(0, 1).toUpperCase();
                        const previousUser = pagedUsers[index - 1];
                        const previousFirstLetter =
                            previousUser === undefined
                                ? ''
                                : previousUser.username.slice(0, 1).toUpperCase();
                        const shouldRenderLetter = previousFirstLetter !== firstLetter;

                        return (
                            <React.Fragment key={user.id}>
                                {shouldRenderLetter && (
                                    <button
                                        type='button'
                                        className='alphabet-character'
                                        title={`Select all users that start with "${firstLetter}"`}
                                        onClick={() =>
                                            toggleAllUsersThatStartWithLetter(firstLetter)
                                        }
                                    >
                                        {firstLetter}
                                    </button>
                                )}
                                <div
                                    aria-pressed={isUserSelected(user)}
                                    className={`result-item ${isUserSelected(user) ? 'bg-brand' : ''}`}
                                    role='button'
                                    tabIndex={0}
                                    onClick={() => toggleUser(user)}
                                    onKeyDown={event => {
                                        if (event.target !== event.currentTarget) {
                                            return;
                                        }

                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            toggleUser(user);
                                        }
                                    }}
                                >
                                    <div className='flex align-center m-medium'>
                                        <button
                                            type='button'
                                            title={
                                                state.currentTab === 'non_whitelisted'
                                                    ? 'Add to whitelist'
                                                    : 'Remove from whitelist'
                                            }
                                            aria-label={
                                                state.currentTab === 'non_whitelisted'
                                                    ? `Add ${user.username} to whitelist`
                                                    : `Remove ${user.username} from whitelist`
                                            }
                                            className='avatar-container'
                                            onClick={e => {
                                                // Prevent selecting result when trying to add to whitelist.
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleUserWhitelistStatus(user);
                                            }}
                                        >
                                            <img
                                                className='avatar'
                                                alt={user.username}
                                                src={user.profile_pic_url}
                                            />
                                            <span className='avatar-icon-overlay-container'>
                                                {state.currentTab === 'non_whitelisted' ? (
                                                    <span>
                                                        <UserCheckIcon size={2} />
                                                    </span>
                                                ) : (
                                                    <span>
                                                        <UserUncheckIcon size={2} />
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                        <div className='flex column m-medium'>
                                            <a
                                                className='fs-xlarge'
                                                target='_blank'
                                                href={`../${user.username}`}
                                                rel='noreferrer'
                                                onClick={event => event.stopPropagation()}
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
                                                    <span className='fs-medium clr-error'>
                                                        &#120;
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                Followed by you:&nbsp;
                                                {user.followed_by_viewer ? (
                                                    <span className='fs-medium clr-success'>✔</span>
                                                ) : (
                                                    <span className='fs-medium clr-error'>
                                                        &#120;
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </article>
            </section>
        </div>
    );
}
