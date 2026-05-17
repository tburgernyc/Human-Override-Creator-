import { describe, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makeSizeGuard, PayloadTooLargeError } from '../server/sizeGuard';

// D5 (audit slice) — `makeSizeGuard` is the streaming cap on /api/transcode's
// raw body. These tests pin the behavior so a future change can't silently
// disable the cap.

const collectingSink = (collected: Buffer[]): Writable =>
    new Writable({
        write(chunk: Buffer, _enc, cb) {
            collected.push(Buffer.from(chunk));
            cb();
        },
    });

describe('makeSizeGuard', () => {
    it('passes through chunks under the cap unchanged', async () => {
        const limit = 1024;
        const source = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
        const collected: Buffer[] = [];

        await pipeline(source, makeSizeGuard(limit), collectingSink(collected));

        expect(Buffer.concat(collected).toString()).toBe('hello world');
    });

    it('aborts the pipeline with PayloadTooLargeError when total exceeds the cap', async () => {
        const limit = 10;
        // 12 bytes total — exceeds limit on the second chunk
        const source = Readable.from([Buffer.from('aaaaaaaa'), Buffer.from('bbbb')]);
        const collected: Buffer[] = [];

        await expect(
            pipeline(source, makeSizeGuard(limit), collectingSink(collected)),
        ).rejects.toBeInstanceOf(PayloadTooLargeError);
    });

    it('preserves the limit on the thrown error so the handler can report it', async () => {
        const limit = 5;
        const source = Readable.from([Buffer.from('123456')]);
        const collected: Buffer[] = [];

        try {
            await pipeline(source, makeSizeGuard(limit), collectingSink(collected));
            expect.fail('pipeline should have rejected');
        } catch (err) {
            expect(err).toBeInstanceOf(PayloadTooLargeError);
            expect((err as PayloadTooLargeError).limitBytes).toBe(limit);
        }
    });

    it('treats exactly-at-limit as accepted (no off-by-one)', async () => {
        const limit = 10;
        const source = Readable.from([Buffer.from('1234567890')]);
        const collected: Buffer[] = [];

        await pipeline(source, makeSizeGuard(limit), collectingSink(collected));

        expect(Buffer.concat(collected).length).toBe(10);
    });

    it('triggers as soon as the running total crosses the cap, not after the full payload', async () => {
        // The guard must reject inside transform() when the rolling sum
        // exceeds the cap — otherwise a 10 GB upload buffers for minutes
        // before the cap kicks in. The test instruments how many chunks
        // reach the sink before the failure.
        const limit = 100;
        const chunks = Array.from({ length: 1000 }, () => Buffer.alloc(50, 0));
        const source = Readable.from(chunks);
        const collected: Buffer[] = [];

        await expect(
            pipeline(source, makeSizeGuard(limit), collectingSink(collected)),
        ).rejects.toBeInstanceOf(PayloadTooLargeError);

        // Only the first two chunks (≤ 100 bytes) should have reached the sink
        // before the third chunk's transform call rejects.
        expect(collected.length).toBeLessThanOrEqual(3);
    });
});
