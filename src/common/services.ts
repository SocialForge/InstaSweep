export interface User {
    readonly id: string;
    readonly username: string;
    readonly full_name: string;
    readonly profile_pic_url: string;
    readonly is_private: boolean;
    readonly is_verified: boolean;
    // TODO: shouldn't be part of this interface.
    // Added/computed manually.
    readonly followed_by_viewer: boolean;
    readonly follows_viewer: boolean;
}

export interface UserListResponse {
    readonly users: readonly User[];
    readonly next_max_id?: string | null;
    readonly user_count?: number;
}

const INSTAGRAM_APP_ID = '936619743392459';
const FOLLOWING_PAGE_SIZE = 50;

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

        return await response.json();
    }

    private async getFollowerIds(): Promise<ReadonlySet<string>> {
        const followerIds = new Set<string>();
        let nextCursor: string | undefined;

        do {
            const response = await this.getUserList('followers', nextCursor);
            for (const user of response.users) {
                followerIds.add(user.id);
            }
            nextCursor = response.next_max_id ?? undefined;
        } while (nextCursor !== undefined);

        return followerIds;
    }

    async getNextUser(): Promise<UserListResponse> {
        if (this.followerIdsPromise === undefined) {
            this.followerIdsPromise = this.getFollowerIds();
        }
        const [followerIds, result] = await Promise.all([
            this.followerIdsPromise,
            this.getUserList('following', this.nextCursor),
        ]);
        this.nextCursor = result.next_max_id ?? undefined;
        return {
            user_count: result.user_count,
            next_max_id: result.next_max_id,
            users: result.users.map(user => ({
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                profile_pic_url: user.profile_pic_url,
                is_private: user.is_private,
                is_verified: user.is_verified,
                followed_by_viewer: true,
                follows_viewer: followerIds.has(user.id),
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
