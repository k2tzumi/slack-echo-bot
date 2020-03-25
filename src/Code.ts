import { OAuth2 } from "apps-script-oauth2/src/OAuth2";
import { Service } from "apps-script-oauth2/src/Service";
import { MessageEvent } from "./MessageEvent";
import { MessageAttachment } from "./MessageAttachment";
import { byteFormat } from "./Utils";
import { Profile } from "./Profile";
import { TeamInfo } from "./TeamInfo";
import { TokenPayload } from "./TokenPayload";
import { OauthAccess } from "./OauthAccess";

const properties = PropertiesService.getScriptProperties();
const VERIFICATION_TOKEN: string = properties.getProperty("VERIFICATION_TOKEN");

/**
 * Authorizes and makes a request to the Slack API.
 */
function doGet(request): GoogleAppsScript.HTML.HtmlOutput {
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
    return HtmlService.createHtmlOutput('Success! You can close this tab.');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab.');
  }
}

const tokenPayloadHandler = function (tokenPayload: TokenPayload): TokenPayload {
  const formData = {
    client_id: tokenPayload.client_id,
    client_secret: tokenPayload.client_secret,
    code: tokenPayload.code,
    redirect_uri: tokenPayload.redirect_uri,
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    contentType: "application/x-www-form-urlencoded",
    method: "post",
    payload: formData
  };

  const response: OauthAccess = JSON.parse(UrlFetchApp.fetch('https://slack.com/api/oauth.v2.access', options).getContentText());

  if (response.ok) {
    // Save access token.
    properties.setProperty('ACCESS_TOKEN', response.access_token);
    // Save incoming webhook.
    properties.setProperty('INCOMING_WEBHOOKS_URL', response.incoming_webhook.url);
  } else {
    console.warn(`error: ${response.error}`);
  }

  delete tokenPayload.client_id;

  return tokenPayload;
}

/**
 * Reset the authorization state, so that it can be re-tested.
 */
function clearService() {
  getService().reset();
}

/**
 * Logs the redict URI to register.
 */
function logRedirectUri() {
  console.log(OAuth2.getRedirectUri());
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
    const teamInfo: TeamInfo = getTeamInfo();

    if (teamInfo !== null) {
      // Save workspace name.
      properties.setProperty('SLACK_WORKSPACE_NAME', teamInfo.domain);

      return teamInfo.domain;
    } else {
      return 'my';
    }
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

const INCOMING_WEBHOOKS_URL: string = properties.getProperty("INCOMING_WEBHOOKS_URL");

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

  UrlFetchApp.fetch(INCOMING_WEBHOOKS_URL, options);
}
