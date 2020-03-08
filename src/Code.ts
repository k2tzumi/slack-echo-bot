import { MessageEvent } from "./MessageEvent";

const properties = PropertiesService.getScriptProperties();
const VERIFICATION_TOKEN: string = properties.getProperty("VERIFICATION_TOKEN");

function doPost(e): GoogleAppsScript.Content.TextOutput {
  const postData = JSON.parse(e.postData.getDataAsString());
  if (postData.token !== VERIFICATION_TOKEN) {
    console.warn("Invalid verification token: %s", postData.token);
    throw new Error("Invalid verification token.");
  }

  let res = {};
  switch (postData.type) {
    case "url_verification":
      console.log({
        data: postData.challenge,
        message: "url_verification called."
      });
      res = { challenge: postData.challenge };
      break;
    case "event_callback":
      console.log({ message: "event_callback called.", data: postData });
      if (!isEventIdProceeded(postData.event_id)) {
        res = eventHandler(postData.event);
      } else {
        console.warn({
          data: postData.event_id,
          message: "event_callback duplicate called."
        });
        res = { duplicated: postData.event_id };
      }
      break;
    default:
      console.error({ message: "unknown event called.", data: postData.type });
      res = { "unknown event": postData.type };
      break;
  }

  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(
    ContentService.MimeType.JSON
  );
}

export function eventHandler(event: MessageEvent) {
  if (event.type === "message") {
    if (typeof event.text !== 'undefined') {
      return messageSent(event);
    } else {
      console.info(`ignore edited event ${event}`);
      return { ignored: event }
    }
  }

  console.error(`unsupported data ${event}`);
  return { unsupported: event };
}

function messageSent(event: MessageEvent) {
  const message: string = convertEchoMessage(event);

  postSlack(message);

  return { posted: message };
}

function convertEchoMessage(event: MessageEvent): string {
  let message: string = event.text;
  message += "\n";
  message += `Posted by ${event.user} in <#${event.channel}> on ${unixTime2Date(event.event_ts)}`
  message += "\n";
  message += extractLink(event);

  return message;
}

function unixTime2Date(ts: string): string {
  const date = new Date(Number(ts) * 1000);

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}

function extractLink(event: MessageEvent): string {
  let url = `https://my.slack.com/archives/${event.channel}/p${event.event_ts}`;

  if (typeof event.thread_ts !== 'undefined') {
    url += `?thread_ts=${event.thread_ts}&cid=${event.parent_user_id}`;
  }

  return url;
}

function isEventIdProceeded(eventId: string): boolean {
  const cash = CacheService.getScriptCache();
  const prevEventId = cash.get(eventId);
  if (prevEventId) {
    return true;
  } else {
    cash.put(eventId, "proceeded", 60);
    return false;
  }
}

const POST_URL: string = properties.getProperty("INCOMING_WEBHOOKS_URL");
const USER_NAME: string = "echo_bot";
const ICON: string = ":robot_face:";

function postSlack(message: string): void {
  const jsonData = {
    icon_emoji: ICON,
    link_names: true,
    text: message,
    username: USER_NAME
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    contentType: "application/json",
    method: "post",
    payload: JSON.stringify(jsonData)
  };

  UrlFetchApp.fetch(POST_URL, options);
}
