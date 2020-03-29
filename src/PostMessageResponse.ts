export interface PostMessageResponse {
    ok: boolean;
    error?: string;
    channel: string;
    ts: string;
    message: [];
}
