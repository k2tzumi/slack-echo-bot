import { MessageEvent } from "./MessageEvent";
import { MessageAttachment } from "./MessageAttachment";
import { byteFormat } from "./Utils";

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
    switch (event.subtype || '') {
      case '':
      case 'file_share':
      case 'thread_broadcast':
        return messageSent(event);
      default:
        console.info(`ignore subtype event ${event.subtype}`);
        return { ignored: event }
    }
  }

  console.error(`unsupported data ${event}`);
  return { unsupported: event };
}

function messageSent(event: MessageEvent): { [key: string]: string; } {
  const attachement: MessageAttachment = convertMessageAttachment(event);

  postSlack(attachement);

  return { posted: attachement.text };
}

function convertMessageAttachment(event: MessageEvent): MessageAttachment {
  let text: string = event.text || '';
  let image_url: string = null;

  (event.files || []).forEach(file => {
    if (text !== '') {
      text += '\n';
    }
    text += `${file.name} \`(size: ${byteFormat(file.size)}, mimetype: ${file.mimetype})\` shared.\n${file.permalink}`;

    if ((image_url === null) && (file.mimetype.indexOf("image/") === 0)) {
      image_url = file.permalink;
    }
  });

  const attachment: MessageAttachment = {
    author_name: `<@${event.user}>`,
    author_link: author_link(event.user),
    text: text,
    color: "#36a64f",
    footer: `Posted in <#${event.channel}> @ ${extractLink(event)}`,
    ts: Number(event.event_ts)
  };

  if (image_url !== null) {
    return Object.assign(attachment, { image_url: image_url });
  }

  return attachment;
}

function extractLink(event: MessageEvent): string {
  let url = `https://my.slack.com/archives/${event.channel}/p${event.event_ts}`;

  if (typeof event.thread_ts !== "undefined") {
    url += `?thread_ts=${event.thread_ts}&cid=${event.parent_user_id || event.user}`;
  }

  return url;
}

function author_link(userID: string): string {
  return `https://my.slack.com/team/${userID}`;
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

function postSlack(attachment: MessageAttachment): void {
  const jsonData = {
    link_names: true,
    attachments: [attachment],
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    contentType: "application/json",
    method: "post",
    payload: JSON.stringify(jsonData)
  };

  UrlFetchApp.fetch(POST_URL, options);
}
