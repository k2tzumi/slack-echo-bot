What is this?
==============================

 It's a web-hook application that notifies you when a public channel is created with Slack.  
 This application runs as a web app within a Google app script.  
 [Slack API] (When you register as an endpoint for a https://api.slack.com/apps) event subscription, you are notified of the name of the channel created for the Slack channel.

REQUIREMENTS
--------------------
- `npm`
- [clasp](https://github.com/google/clasp)  
`npm install -g @google/clasp`
- `make`

USAGE
--------------------

To use it, you need to set up Google apps scripts and Slack API.

### Install Google apps scripts

1. Enable Google Apps Script API  
https://script.google.com/home/usersettings
2. make push  
3. make deploy  
4. Grant the necessary privileges  
make open  
Publish > Deploy as web app.. > Update  
Grant access

### Register with the Slack API

1. Create New App  
https://api.slack.com/apps
2. Setting Event Subscriptions  
Turn on.  
Setting Request URL.  
ex) https://script.google.com/macros/s/miserarenaiyo/exec  
Add Workspace Event.   
Select `channel_created`.
3. Activate Incoming Webhooks  
Turn on.  
Add New Webhook to Workspace.  
Select the channel to notify.

### Setting Script properties

In order to run the application and change its behavior, you need to set the following Google Apps scripts property.

|Property name|Required|Setting Value|Description|
|--|--|--|--|
|VERIFICATION_TOKEN|○|Basic Information > App Credentials > Verification Token|A token that easily authenticates the source of a hooked request|
|INCOMING_WEBHOOKS_URL|○|Incoming Webhooks > Webhook URL|Incoming Webhooks URL Activated During Slack API Registration|
|NOTIFICATION_MESSAGE|optional|Free text message|default `A public channel created :point_right: `|

1. Open Project  
`$ make open`
2. Add Scirpt properties  
File > Project properties > Scirpt properties > Add row  
Setting Property & Value
