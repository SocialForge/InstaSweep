import { type Node, type User } from '../model/user';

interface UserListResponse {
    readonly users: readonly unknown[];
    readonly next_max_id?: string | null;
    readonly user_count?: number;
}

interface FollowingResponse extends UserListResponse {
    readonly users: readonly FollowingUser[];
}

interface FollowingUser {
    readonly pk: string;
    readonly username: string;
    readonly full_name: string;
    readonly profile_pic_url: string;
    readonly is_private: boolean;
    readonly is_verified: boolean;
}

const INSTAGRAM_APP_ID = '936619743392459';
const FOLLOWING_PAGE_SIZE = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isFollowingUser(value: unknown): value is FollowingUser {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.pk === 'string' &&
        typeof value.username === 'string' &&
        typeof value.full_name === 'string' &&
        typeof value.profile_pic_url === 'string' &&
        typeof value.is_private === 'boolean' &&
        typeof value.is_verified === 'boolean'
    );
}

function isUserListResponse(value: unknown): value is UserListResponse {
    if (!isRecord(value) || !Array.isArray(value.users)) {
        return false;
    }

    if (
        value.next_max_id !== undefined &&
        value.next_max_id !== null &&
        typeof value.next_max_id !== 'string'
    ) {
        return false;
    }

    if (value.user_count !== undefined && typeof value.user_count !== 'number') {
        return false;
    }

    return true;
}

function isFollowingResponse(value: UserListResponse): value is FollowingResponse {
    return value.users.every(isFollowingUser);
}

function isUserWithId(value: unknown): value is { readonly pk: string } {
    return isRecord(value) && typeof value.pk === 'string';
}

function toNode(user: FollowingUser, followerIds: ReadonlySet<string>): Node {
    return {
        id: user.pk,
        username: user.username,
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url,
        is_private: user.is_private,
        is_verified: user.is_verified,
        followed_by_viewer: true,
        follows_viewer: followerIds.has(user.pk),
        requested_by_viewer: false,
    };
}

function getResponseErrorMessage(action: string, response: Response): string {
    const statusText = response.statusText === '' ? 'Request failed' : response.statusText;
    return `${action} failed: ${response.status} ${statusText}`;
}

export class InstagramService {
    private nextCursor: string | undefined = undefined;
    private followerIdsPromise: Promise<ReadonlySet<string>> | undefined = undefined;

    private getCookie(name: string): string | null {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length !== 2) {
            return null;
        }

        const cookieValue = parts[1]?.split(';')[0];
        if (cookieValue === undefined || cookieValue === '') {
            return null;
        }

        return cookieValue;
    }

    private getRequiredCookie(name: string): string {
        const cookieValue = this.getCookie(name);
        if (cookieValue === null) {
            throw new Error(`${name} cookie is missing`);
        }

        return cookieValue;
    }

    private getUnfollowUrl(idToUnfollow: string): string {
        return `https://www.instagram.com/web/friendships/${idToUnfollow}/unfollow/`;
    }

    // private getFollowUrl(idToFollow: string): string {
    //     return `https://www.instagram.com/web/friendships/${idToFollow}/follow/`;
    // }

    // private getBlockUrl(idToBlock: string): string {
    //     return `https://www.instagram.com/api/v1/web/friendships/${idToBlock}/block/`;
    // }

    // private getUnblockUrl(idToUnblock: string): string {
    //     return `https://www.instagram.com/api/v1/web/friendships/${idToUnblock}/unblock/`;
    // }

    private getUserListUrl(relationship: 'followers' | 'following', nextCursor?: string): string {
        const dsUserId = this.getRequiredCookie('ds_user_id');
        const url = new URL(
            `https://www.instagram.com/api/v1/friendships/${dsUserId}/${relationship}/`,
        );
        url.searchParams.set('count', String(FOLLOWING_PAGE_SIZE));
        if (nextCursor !== undefined) {
            url.searchParams.set('max_id', nextCursor);
        }
        return url.toString();
    }

    private async getUserList(
        relationship: 'followers' | 'following',
        nextCursor?: string,
    ): Promise<UserListResponse> {
        const response = await fetch(this.getUserListUrl(relationship, nextCursor), {
            credentials: 'include',
            headers: {
                'x-ig-app-id': INSTAGRAM_APP_ID,
                'x-requested-with': 'XMLHttpRequest',
            },
        });
        if (!response.ok) {
            throw new Error(getResponseErrorMessage(`${relationship} scan request`, response));
        }

        const result: unknown = await response.json();
        if (!isUserListResponse(result)) {
            throw new Error(`Unexpected Instagram ${relationship} response payload`);
        }

        return result;
    }

    private async getFollowerIds(): Promise<ReadonlySet<string>> {
        const followerIds = new Set<string>();
        let nextCursor: string | undefined;

        do {
            const response = await this.getUserList('followers', nextCursor);
            for (const user of response.users) {
                if (!isUserWithId(user)) {
                    throw new Error('Unexpected Instagram followers user payload');
                }
                followerIds.add(user.pk);
            }
            nextCursor = response.next_max_id ?? undefined;
        } while (nextCursor !== undefined);

        return followerIds;
    }

    async getNextUser(): Promise<User> {
        if (this.followerIdsPromise === undefined) {
            this.followerIdsPromise = this.getFollowerIds();
        }
        const [followerIds, result] = await Promise.all([
            this.followerIdsPromise,
            this.getUserList('following', this.nextCursor),
        ]);
        if (!isFollowingResponse(result)) {
            throw new Error('Unexpected Instagram following response payload');
        }
        this.nextCursor = result.next_max_id ?? undefined;
        return {
            count: result.user_count ?? null,
            page_info: {
                has_next_page: result.next_max_id !== null && result.next_max_id !== undefined,
                end_cursor: result.next_max_id ?? '',
            },
            edges: result.users.map(user => ({
                node: toNode(user, followerIds),
            })),
        };
    }

    async unfollow(userId: string): Promise<Response> {
        const csrfToken = this.getRequiredCookie('csrftoken');
        const response = await fetch(this.getUnfollowUrl(userId), {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-csrftoken': csrfToken,
            },
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(getResponseErrorMessage('Unfollow request', response));
        }

        return response;
    }
}
