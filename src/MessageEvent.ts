import { MessageEditedEvent } from "./MessageEditedEvent";
import { ShareFile } from "./ShareFile";

export interface MessageEvent {
    type: string;
    subtype?: string;
    channel: string;
    user: string;
    text?: string;
    files?: ShareFile[];
    ts: string;
    event_ts: string;
    channel_type: string;
    edited?: MessageEditedEvent;
    thread_ts?: string;
    parent_user_id?: string;
    blocks?: [];
    deleted_ts?: string;
}
