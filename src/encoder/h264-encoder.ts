import { AsyncSubject, Observable, Subject, Subscription } from "rxjs";
import { BlockingQueue, ReadQueue } from "../shared/blocking-queue";
import { LeaderFollowerQueue } from "../shared/leader-follower";
import { ENCODER_RESOLUTION, EncoderResolution, H264Profile, H264_PROFILES, UncloggingMethod } from "./interfaces";

const H264_LEVEL = 52;
const BITSTREAM_CAPCITY = 10;
const ENCODER_QUEUE_SIZE = 2;

const UNCLOG_POLLING_INTERVAL_MILLIS = 100;

export class H264Encoder {
    private readonly bitstream = new BlockingQueue<{
        chunk: EncodedVideoChunk;
        metadata: EncodedVideoChunkMetadata | undefined;
    }>(BITSTREAM_CAPCITY);
    private readonly leader = new LeaderFollowerQueue();

    get packets(): ReadQueue<{
        chunk: EncodedVideoChunk;
        metadata: EncodedVideoChunkMetadata | undefined;
    }> {
        return this.bitstream;
    }

    private readonly encoder: VideoEncoder;
    private readonly tick = new AsyncSubject<void>();

    constructor(
        private readonly frames: ReadQueue<VideoFrame>,
        private readonly onEncoding: (frame: VideoFrame) => void,
        h264Profile: H264Profile,
        encoderResolution: EncoderResolution,
        encoderConfig: Omit<VideoEncoderConfig, 'width' | 'height' | 'codec'>,
        private readonly uncloggingMethod: UncloggingMethod
    ) {
        this.encoder = new VideoEncoder({
            output: async (chunk, metadata) => {
                this.tick.next();

                this.leader.enqueuePromise(async () => {
                    await this.bitstream.push({ chunk, metadata })
                });
            },
            error: error => {
                this.tick.error(error);
                
                alert(`Encoder error ${error.name}: ${error.message}`);
                console.error(error);
            }
        });

        this.encoder.configure({
            codec: `avc1.${H264_PROFILES[h264Profile].toString(16).padStart(2, '0')}00${H264_LEVEL.toString(16).padStart(2, '0')}`,
            ...ENCODER_RESOLUTION[encoderResolution],
            ...encoderConfig,
        });

        this.encode().catch(error => {
            alert(`Error while encoding frames: ${error instanceof Error ? error.message : error}`);
        });
    }

    private async maybeWaitUntilUnclogged(): Promise<void> {
        // If the inbound queue size is below the threshold, we continue feeding frames
        // into the encoder.
        if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
            return;
        }

        // When the inbound queue overflows and the `flush_encoder` unclogging method is selected,
        // we simply flush the encoder to force any queued frames to be processed.
        if (this.uncloggingMethod === 'flush_encoder') {
            await this.encoder.flush();
        
            if (this.encoder.encodeQueueSize >= ENCODER_QUEUE_SIZE) {
                throw new Error(`Encoder was flushed, but encode queue size is still at ${this.encoder.encodeQueueSize} (should be below ${ENCODER_QUEUE_SIZE}`);
            }

            return;
        }

        let intervalId: number | undefined = undefined;
        let tickSubscription: Subscription | undefined = undefined;

        try {
            return await new Promise<void>(resolve => {
                if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                    resolve();
                }

                // Otherwise ('dequeue_event' or 'polling_output' unclogging method selected),
                // we always wait for the "dequeue" event.
                this.encoder.ondequeue = () => {
                    if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                        resolve();
                    }
                }

                if (this.uncloggingMethod === 'polling_output') {
                    // If the 'polling_output' unclogging method is selected, we also asynchronously check
                    // for the inbound queue size to go down and also recheck whenever an output packet is produced.

                    tickSubscription = this.tick.subscribe(() => {
                        if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                            resolve();
                        }
                    });

                    intervalId = setInterval(() => {
                        if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                            resolve();
                        }
                    }, UNCLOG_POLLING_INTERVAL_MILLIS);
                }
            });
        } finally {
            this.encoder.ondequeue = null;
    
            if (tickSubscription !== undefined) {
                (tickSubscription as Subscription).unsubscribe();
            }
            clearInterval(intervalId);
        }
    }

    private async encode(): Promise<void> {
        for (let frame = await this.frames.pull(); frame !== undefined; frame = await this.frames.pull()) {
            await this.maybeWaitUntilUnclogged();

            this.onEncoding(frame);
            this.encoder.encode(frame);
            frame.close();
        }

        await this.encoder.flush();

        this.leader.enqueuePromise(async () => {
            this.bitstream.close();
        });
    }
}