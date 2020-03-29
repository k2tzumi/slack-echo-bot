const properties = PropertiesService.getScriptProperties();
const SIGNING_SECRET: string = properties.getProperty("SIGNING_SECRET");

export const verifySignature = function (e): boolean {
    const signature: string = e.headers['X-Slack-Signature'] || e.headers['x-slack-signature'];
    const timestamp: string = e.headers['X-Slack-Request-Timestamp'] || e.headers['x-slack-request-timestamp'];

    if (verifyTimestamp(timestamp)) {
        const rawBody = e.postData.contents;
        const [version, hash] = signature.split('=');
        const text = `${version}:${timestamp}:${rawBody}`;

        const hmac = Utilities.computeHmacSha256Signature(text, SIGNING_SECRET);
        const sign = hmac.map(function (chr) {
            return (chr + 256).toString(16).slice(-2)
        }).join('');

        return sign === hash;
    } else {
        return false;
    }
};

const verifyTimestamp = function (timestamp) {
    const currentTime = new Date().getTime() / 1000;
    return (currentTime - timestamp) < 60;
};
