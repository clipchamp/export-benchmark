import { BlockingQueue, ReadQueue } from "../shared/blocking-queue";
import { LeaderFollowerQueue } from "../shared/leader-follower";
import { ENCODER_RESOLUTION, EncoderResolution, H264Profile, H264_PROFILES } from "./interfaces";

const H264_LEVEL = 52;
const BITSTREAM_CAPCITY = 10;
const ENCODER_QUEUE_SIZE = 2;

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

    constructor(
        private readonly frames: ReadQueue<VideoFrame>,
        private readonly onEncoding: (frame: VideoFrame) => void,
        h264Profile: H264Profile,
        encoderResolution: EncoderResolution,
        encoderConfig: Omit<VideoEncoderConfig, 'width' | 'height' | 'codec'>,
    ) {
        this.encoder = new VideoEncoder({
            output: async (chunk, metadata) => {
                this.leader.enqueuePromise(async () => {
                    await this.bitstream.push({ chunk, metadata })
                });
            },
            error: error => {
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
        if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
            return;
        }

        return await new Promise<void>((resolve, reject) => {
            if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                resolve();
            }

            this.encoder.ondequeue = () => {
                if (this.encoder.encodeQueueSize < ENCODER_QUEUE_SIZE) {
                    resolve();
                } else {
                    this.maybeWaitUntilUnclogged().then(resolve, reject);
                }
            }
        });

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