import { eventHandler } from "./Code";
import { MessageEvent } from "./MessageEvent";

function testEventHandler() {
  let event: MessageEvent =
  {
    type: "message",
    channel: "C2147483705",
    user: "U2147483697",
    text: "Hello world",
    channel_type: "channel",
    event_ts: "1355517523.000005",
    ts: "1355517523.000005"
  };

  eventHandler(event);
}
