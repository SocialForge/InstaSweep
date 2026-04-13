import { type User } from '../model/user';

interface EdgeFollowResponse {
    readonly data: {
        readonly user: {
            readonly edge_follow: User;
        };
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isEdgeFollowResponse(value: unknown): value is EdgeFollowResponse {
    if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.user)) {
        return false;
    }

    return 'edge_follow' in value.data.user;
}

function getResponseErrorMessage(action: string, response: Response): string {
    const statusText = response.statusText === '' ? 'Request failed' : response.statusText;
    return `${action} failed: ${response.status} ${statusText}`;
}

export class InstagramService {
    private nextUrlCode: string | undefined = undefined;

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

    private getNextUrl(nextUrlCode?: string): string {
        const dsUserId = this.getRequiredCookie('ds_user_id');
        if (nextUrlCode === undefined) {
            // First url
            return `https://www.instagram.com/graphql/query/?query_hash=3dec7e2c57367ef3da3d987d89f9dbc8&variables={"id":"${dsUserId}","include_reel":"true","fetch_mutual":"false","first":"24"}`;
        }
        return `https://www.instagram.com/graphql/query/?query_hash=3dec7e2c57367ef3da3d987d89f9dbc8&variables={"id":"${dsUserId}","include_reel":"true","fetch_mutual":"false","first":"24","after":"${nextUrlCode}"}`;
    }

    async getNextUser(): Promise<User> {
        const nextUrl = this.getNextUrl(this.nextUrlCode);
        const res = await fetch(nextUrl);
        if (!res.ok) {
            throw new Error(getResponseErrorMessage('Follower scan request', res));
        }

        const result: unknown = await res.json();
        if (!isEdgeFollowResponse(result)) {
            throw new Error('Unexpected Instagram response payload');
        }

        const user: User = result.data.user.edge_follow;
        this.nextUrlCode = user.page_info.end_cursor;
        return user;
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
