import { MessageEditedEvent } from "./MessageEditedEvent";

export interface MessageEvent {
    type: string;
    channel: string;
    user: string;
    text?: string;
    ts: string;
    event_ts: string;
    channel_type: string;
    edited?: MessageEditedEvent;
    thread_ts?: string;
    parent_user_id?: string;
}
