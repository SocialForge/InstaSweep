import { type User } from 'model/user';

export class InstagramService {
    private nextUrlCode: string | undefined = undefined;

    private getCookie(name: string): string | null {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length !== 2) {
            return null;
        }
        return parts.pop()!.split(';').shift()!;
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
        const ds_user_id = this.getCookie('ds_user_id');
        if (nextUrlCode === undefined) {
            // First url
            return `https://www.instagram.com/graphql/query/?query_hash=3dec7e2c57367ef3da3d987d89f9dbc8&variables={"id":"${ds_user_id}","include_reel":"true","fetch_mutual":"false","first":"24"}`;
        }
        return `https://www.instagram.com/graphql/query/?query_hash=3dec7e2c57367ef3da3d987d89f9dbc8&variables={"id":"${ds_user_id}","include_reel":"true","fetch_mutual":"false","first":"24","after":"${nextUrlCode}"}`;
    }

    async getNextUser(): Promise<User> {
        const nextUrl = this.getNextUrl(this.nextUrlCode);
        const res = await fetch(nextUrl);
        const result = await res.json();
        const user: User = result.data.user.edge_follow;
        this.nextUrlCode = user.page_info.end_cursor;
        return user;
    }

    unfollow(userId: string): Promise<Response> {
        const csrfToken = this.getCookie('csrftoken');
        if (csrfToken === null) {
            throw new Error('csrftoken cookie is null');
        }

        return fetch(this.getUnfollowUrl(userId), {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-csrftoken': csrfToken,
            },
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
        });
    }
}
