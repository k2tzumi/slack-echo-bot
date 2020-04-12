import { OAuth2 } from "apps-script-oauth2/src/OAuth2";
import { Service } from "apps-script-oauth2/src/Service";
import { MessageEvent } from "./MessageEvent";
import { MessageAttachment } from "./MessageAttachment";
import { byteFormat } from "./Utils";
import { Profile } from "./Profile";
import { TeamInfo } from "./TeamInfo";
import { TokenPayload } from "./TokenPayload";
import { OauthAccess } from "./OauthAccess";
import { PostMessageResponse } from "./PostMessageResponse";

const properties = PropertiesService.getScriptProperties();
const VERIFICATION_TOKEN: string = properties.getProperty("VERIFICATION_TOKEN");

/**
 * Authorizes and makes a request to the Slack API.
 */
function doGet(request): GoogleAppsScript.HTML.HtmlOutput {
  // Clear authentication by accessing with the get parameter `?logout=true`
  if (request.parameter.logout) {
    clearService();
    const template = HtmlService.createTemplate('Logout<br /><a href="<?= requestUrl ?>" target="_blank">refresh</a>.');
    template.requestUrl = getRequestURL();
    return HtmlService.createHtmlOutput(template.evaluate());
  }

  const service: Service = getService();

  if (service.hasAccess()) {
    return HtmlService.createHtmlOutput('OK');
  } else {
    const template = HtmlService.createTemplate('RedirectUri:<?= redirectUrl ?> <br /><a href="<?= authorizationUrl ?>" target="_blank">Authorize</a>.');
    template.authorizationUrl = service.getAuthorizationUrl();
    template.redirectUrl = service.getRedirectUri();
    return HtmlService.createHtmlOutput(template.evaluate());
  }
}

const CLIENT_ID: string = properties.getProperty("CLIENT_ID");
const CLIENT_SECRET: string = properties.getProperty("CLIENT_SECRET");

/**
 * Configures the service.
 */
function getService(): Service {
  return OAuth2.createService('slack')
    .setAuthorizationBaseUrl('https://slack.com/oauth/v2/authorize')
    .setTokenUrl('https://api.slack.com/methods/oauth.v2.access')
    .setTokenFormat('application/x-www-form-urlencoded')
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('chat:write,channels:read,channels:history,users.profile:read,team:read,incoming-webhook')
    .setTokenPayloadHandler(tokenPayloadHandler);
}

/**
 * Handles the OAuth callback.
 */
function authCallback(request): GoogleAppsScript.HTML.HtmlOutput {
  const service: Service = getService();
  const authorized = service.handleCallback(request);
  if (authorized) {
    const oAuthAccess: OauthAccess = getOauthAccess(request.parameter.code);
    if (oAuthAccess) {
      initializeProperty(oAuthAccess);
      // updateEventSubscriptions(oAuthAccess);

      const template = HtmlService.createTemplate('Success!<br /><a href="<?= eventSubscriptionsUrl ?>">Setting EventSubscriptions</a>');
      template.eventSubscriptionsUrl = `https://api.slack.com/apps/${oAuthAccess.app_id}/event-subscriptions?`;

      return HtmlService.createHtmlOutput(template.evaluate());
    }
  }

  return HtmlService.createHtmlOutput('Denied. You can close this tab.');
}

function getOauthAccess(code: string): OauthAccess | null {
  const formData = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    contentType: "application/x-www-form-urlencoded",
    method: "post",
    payload: formData
  };

  const response: OauthAccess = JSON.parse(UrlFetchApp.fetch('https://slack.com/api/oauth.v2.access', options).getContentText());

  if (response.ok) {
    return response;
  } else {
    console.warn(`error: ${response.error}`);
    return null;
  }
}

function initializeProperty(oAuthAccess: OauthAccess) {
  // Save access token.
  properties.setProperty('ACCESS_TOKEN', oAuthAccess.access_token);
  // save workspace naem.
  loadWorkspaceName();
  // Save channel name.
  properties.setProperty('CHANNEL_NAME', oAuthAccess.incoming_webhook.channel);
  // Save bot user id.
  properties.setProperty('BOT_USER_ID', oAuthAccess.bot_user_id);
}

function updateEventSubscriptions(oAuthAccess: OauthAccess): void {
  const formData = {
    app: oAuthAccess.app_id,
    url: getRequestURL(),
    app_event_types: [],
    enable: true,
    bot_event_types: ["message.channels"],
    unfurl_domains: [],
    filter_teams: [],
    set_active: true,
    token: oAuthAccess.access_token,
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    contentType: "application/x-www-form-urlencoded",
    method: "post",
    payload: formData
  };

  const response: OauthAccess = JSON.parse(UrlFetchApp.fetch('https://api.slack.com/api/developer.apps.events.subscriptions.updateSubs', options).getContentText());

  if (!response.ok) {
    console.warn(`error: ${response.error}`);
    throw new Error(JSON.stringify(response));
  }
}

function getRequestURL() {
  const serviceURL = ScriptApp.getService().getUrl();
  return serviceURL.replace('/dev', '/exec');
}

const tokenPayloadHandler = function (tokenPayload: TokenPayload): TokenPayload {
  delete tokenPayload.client_id;

  return tokenPayload;
}

/**
 * Reset the authorization state, so that it can be re-tested.
 */
function clearService() {
  getService().reset();
}

function getAccessToken(): string {
  const ACCESS_TOKEN: string = properties.getProperty("ACCESS_TOKEN");

  if (ACCESS_TOKEN !== null) {
    return ACCESS_TOKEN;
  } else {
    const token: string = getService().getAccessToken();

    if (token !== null) {
      // Save access token.
      properties.setProperty('ACCESS_TOKEN', token);

      return token;
    }
  }
}

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

const BOT_USER_ID: string = properties.getProperty("BOT_USER_ID");

export function eventHandler(event: MessageEvent) {
  if (event.type === "message") {
    switch (event.subtype || '') {
      case '':
      case 'file_share':
      case 'thread_broadcast':
        if (event.user !== BOT_USER_ID) {
          return messageSent(event);
        } else {
          console.info(`ignore bot user event ${event.subtype}`);
          return { ignored: event }
        }
      case 'message_deleted':
        if (event.user !== BOT_USER_ID) {
          return messageDeleted(event);
        } else {
          console.info(`ignore bot user event ${event.subtype}`);
          return { ignored: event }
        }
      default:
        console.info(`ignore subtype event ${event.subtype}`);
        return { ignored: event }
    }
  }

  console.error(`unsupported data ${event}`);
  return { unsupported: event };
}

function messageDeleted(event: MessageEvent): { [key: string]: string; } {
  const messsageReference = getCacheMessage(event.channel, event.deleted_ts);

  if (messsageReference) {
    const response = unpostMessage(messsageReference.channel, messsageReference.ts);

    return { "deleted": response };
  } else {
    return { "undeleted": extractLink(event) };
  }
}

function unpostMessage(channel: string, ts: string): any {
  const jsonData = {
    channel: channel,
    ts: ts,
  };

  const headers = {
    "content-type": "application/json",
    "Authorization": `Bearer ${getAccessToken()}`,
  }

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(jsonData),
  };

  const response = JSON.parse(UrlFetchApp.fetch('https://slack.com/api/chat.delete', options).getContentText());

  if (!response.ok) {
    console.warn(response.error);
    throw new Error(`message delete faild. ${JSON.stringify(response)}`);
  }

  return response;
}

function getCacheMessage(channel: string, ts: string): { [key: string]: string; } | null {
  const cash = CacheService.getScriptCache();
  const key = `${channel}:${ts}`;
  const value = cash.get(key);

  if (value) {
    const [channel, ts] = value.split(':');

    return { "channel": channel, "ts": ts };
  } else {
    return null;
  }
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
    text: text,
    color: "#36a64f",
    footer: `Posted in <#${event.channel}> @ ${extractLink(event)}`,
    ts: Number(event.event_ts)
  };

  return Object.assign(attachment, profileAttachment(event.user), image_url ? { image_url: image_url } : null);
}

function profileAttachment(userID: string): MessageAttachment {
  const profile = getProfile(userID);
  const link = author_link(userID);

  if (profile) {
    const atachment: MessageAttachment = {
      author_name: createAuthorName(profile),
      author_icon: profile.image_32,
      author_link: link,
    };

    return atachment;
  } else {
    const atachment: MessageAttachment = {
      author_name: `<@${userID}>`,
      author_link: link,
    };

    return atachment;
  }
}

function createAuthorName(profile: Profile) {
  let authorName;

  if (profile.display_name) {
    authorName = profile.display_name;
  } else {
    authorName = profile.real_name;
  }
  if (profile.status_emoji) {
    authorName += ' ' + profile.status_emoji;
  }

  return authorName;
}

function getProfile(userID: string): Profile | null {
  const cash = CacheService.getScriptCache();
  const value = JSON.parse(cash.get(userID));

  if (value !== null) {
    const profile: Profile = {
      display_name: value.display_name,
      real_name: value.real_name,
      image_32: value.image_32,
      status_emoji: value.status_emoji,
    }
    return profile;
  } else {
    const response = JSON.parse(UrlFetchApp.fetch(`https://slack.com/api/users.profile.get?token=${getAccessToken()}&user=${userID}`).getContentText());

    if (response.ok) {
      const profile: Profile = {
        display_name: response.profile.display_name,
        real_name: response.profile.real_name,
        image_32: response.profile.image_32,
        status_emoji: response.profile.status_emoji,
      }
      cash.put(userID, JSON.stringify(profile));
      return profile;
    } else {
      console.warn(`error: ${response.error}, userID: ${userID}`);
      return null;
    }
  }
}

function extractLink(event: MessageEvent): string {
  let url = `https://${workspaceName()}.slack.com/archives/${event.channel}/p${event.event_ts}`;

  if (typeof event.thread_ts !== "undefined") {
    url += `?thread_ts=${event.thread_ts}&cid=${event.parent_user_id || event.user}`;
  }

  return url;
}

function workspaceName(): string {
  const SLACK_WORKSPACE_NAME: string = properties.getProperty("SLACK_WORKSPACE_NAME");

  if (SLACK_WORKSPACE_NAME !== null) {
    return SLACK_WORKSPACE_NAME;
  } else {
    return loadWorkspaceName();
  }
}

function loadWorkspaceName(): string {
  const teamInfo: TeamInfo = getTeamInfo();

  if (teamInfo !== null) {
    // Save workspace name.
    properties.setProperty('SLACK_WORKSPACE_NAME', teamInfo.domain);

    return teamInfo.domain;
  } else {
    return 'my';
  }
}

function getTeamInfo(): TeamInfo | null {
  const response = JSON.parse(UrlFetchApp.fetch(`https://slack.com/api/team.info?token=${getAccessToken()}`).getContentText());

  if (response.ok) {
    const teamInfo: TeamInfo = {
      domain: response.team.domain
    }

    return teamInfo;
  } else {
    console.warn(`error: ${response.error}`);
    return null;
  }
}

function author_link(userID: string): string {
  return `https://${workspaceName()}.slack.com/team/${userID}`;
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

const CHANNEL_NAME: string = properties.getProperty("CHANNEL_NAME");

function postSlack(attachment: MessageAttachment): void {
  const jsonData = {
    channel: CHANNEL_NAME,
    link_names: true,
    mrkdwn: true,
    unfurl_links: true,
    attachments: [attachment],
  };

  const headers = {
    "content-type": "application/json",
    "Authorization": `Bearer ${getAccessToken()}`,
  }

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post",
    headers: headers,
    payload: JSON.stringify(jsonData),
  };

  const response: PostMessageResponse = JSON.parse(UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', options).getContentText());

  if (!response.ok) {
    console.warn(response.error);
    throw new Error(`message post faild. ${JSON.stringify(response)}`);
  }

  cacheMessage(getMessageReference(attachment), response);
}

function cacheMessage(messageReference: { [key: string]: string; }, response: PostMessageResponse): void {
  const cash = CacheService.getScriptCache();
  const key = `${messageReference.channel}:${messageReference.ts}`;
  const value = `${response.channel}:${response.ts}`;

  cash.put(key, value);
}

function getMessageReference(attachment: MessageAttachment): { [key: string]: string; } {
  const [/*posted_user*/, messageUrl] = attachment.footer.split('@');
  const [massagePath,/*query*/] = messageUrl.split('?');
  // ex) https://my.slack.com/archives/C2147483705/p1355517523.000005
  const [/*schme*/, ,/*domain*/,/*archives*/, channel, ts] = massagePath.split('/');

  return { "channel": channel, "ts": ts.slice(1) };
}