export function unixTime2Date(ts: string): string {
    const date = new Date(Number(ts) * 1000);

    return `${date.getFullYear()}-${zeroPadding(date.getMonth() + 1, 2)}-${zeroPadding(date.getDate(), 2)} ${zeroPadding(date.getHours(), 2)}:${zeroPadding(date.getMinutes(), 2)}:${zeroPadding(date.getSeconds(), 2)}`;
}

export function zeroPadding(num: number, len: number): string {
    return (Array(len).join('0') + num).slice(-len);
}
