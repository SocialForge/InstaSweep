export interface User {
    readonly count: number | null;
    readonly page_info: PageInfo;
    readonly edges: readonly Edge[];
}

export interface Edge {
    readonly node: Node;
}

export interface Node {
    readonly id: string;
    readonly username: string;
    readonly full_name: string;
    readonly profile_pic_url: string;
    readonly is_private: boolean;
    readonly is_verified: boolean;
    readonly followed_by_viewer: boolean;
    readonly follows_viewer: boolean;
    readonly requested_by_viewer: boolean;
}

export interface PageInfo {
    readonly has_next_page: boolean;
    readonly end_cursor: string;
}
