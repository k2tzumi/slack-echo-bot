export function unixTime2Date(ts: string): string {
    const date = new Date(Number(ts) * 1000);

    return `${date.getFullYear()}-${zeroPadding(date.getMonth() + 1, 2)}-${zeroPadding(date.getDate(), 2)} ${zeroPadding(date.getHours(), 2)}:${zeroPadding(date.getMinutes(), 2)}:${zeroPadding(date.getSeconds(), 2)}`;
}

export function zeroPadding(num: number, len: number): string {
    return (Array(len).join('0') + num).slice(-len);
}

export function byteFormat(number: number): string {
    const suffix = ['Byte', 'KB', 'MB', 'GB', 'TB', 'PB', 'ZB', 'YB'];
    const target = Math.floor(Math.log(number) / Math.log(1024));

    return (number / Math.pow(1024, Math.floor(target))).toFixed(0) + ' ' + suffix[target];
}
