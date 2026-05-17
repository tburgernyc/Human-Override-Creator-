import { Transform } from 'node:stream';

// D5 (audit slice) — primitives for capping the byte-size of a streamed
// request body. Extracted from proxy.ts so the cap can be exercised under
// vitest without spinning up Express.

export class PayloadTooLargeError extends Error {
    constructor(public readonly limitBytes: number) {
        super(`Payload exceeds ${limitBytes} bytes`);
        this.name = 'PayloadTooLargeError';
    }
}

// Pass-through Transform that aborts when the running total exceeds
// limitBytes. Wire into `pipeline(req, makeSizeGuard(N), sink)` so the upload
// is rejected mid-stream rather than buffering the full payload before the
// check.
export const makeSizeGuard = (limitBytes: number): Transform => {
    let received = 0;
    return new Transform({
        transform(chunk: Buffer, _enc, cb) {
            received += chunk.length;
            if (received > limitBytes) {
                cb(new PayloadTooLargeError(limitBytes));
                return;
            }
            cb(null, chunk);
        },
    });
};
