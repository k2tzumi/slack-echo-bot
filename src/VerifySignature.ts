const properties = PropertiesService.getScriptProperties();
const SIGNING_SECRET: string = properties.getProperty("SIGNING_SECRET");

export const verifySignature = function (e): boolean {
    const signature: string = e.headers['X-Slack-Signature'] || e.headers['x-slack-signature'];
    const timestamp: string = e.headers['X-Slack-Request-Timestamp'] || e.headers['x-slack-request-timestamp'];

    if (verifyTimestamp(timestamp)) {
        const rawBody = e.rawRequest;
        const hmac = crypto.createHmac('sha256', SIGNING_SECRET);

        const [version, hash] = signature.split('=');

        hmac.update(`${version}:${timestamp}:${rawBody}`);

        return hmac.digest('hex') === hash;
    } else {
        return false;
    }
};

const verifyTimestamp = function (timestamp) {
    const currentTime = new Date().getTime() / 1000;
    return (currentTime - timestamp) < 60;
};
