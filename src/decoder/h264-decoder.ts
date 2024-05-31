import { BlockingQueue, ReadQueue } from "../shared/blocking-queue";
import { LeaderFollowerQueue } from "../shared/leader-follower";

const FRAME_QUEUE_SIZE = 2;

export class H264Decoder {
    private flushed = false;
    private readonly decoder: VideoDecoder;
    private readonly leader = new LeaderFollowerQueue();
    private readonly framestream = new BlockingQueue<VideoFrame>(FRAME_QUEUE_SIZE);

    private paused: boolean = false;
    private onResume?: () => void;

    constructor(
        private readonly demuxed: {
            config: VideoDecoderConfig,
            packets: ReadQueue<EncodedVideoChunk>
        }
    ) {
        this.decoder = new VideoDecoder({
            output: async frame => {
                this.leader.enqueuePromise(async () => {
                    if (this.framestream.spareCapacity <= 0) {
                        // We need to pause feeding packets into the decoder
                        this.pause();
                    }

                    await this.framestream.push(frame);
                    this.resume();
                });
            },
            error: error => {
                alert(`Decoder error ${error.name}: ${error.message}`);
                console.error(error);
            },
        });

        // Not sure if that's needed.
        this.framestream.onSpareCapacity = () => {
            this.resume();
        }

        this.decoder.configure(this.demuxed.config);

        this.decode().catch(error => {
            alert(`Error while decoding packets: ${error instanceof Error ? error.message : error}`);
        });
    }

    get frames(): ReadQueue<VideoFrame> {
        return this.framestream;
    }

    private pause(): void {
        this.paused = true;
    }

    private resume(): void {
        this.paused = false;
        if (this.onResume) {
            this.onResume();
        }
    }

    private waitUntilResumed(): Promise<void> {
        return new Promise<void>(resolve => {
            if (!this.paused) {
                return;
            }

            this.onResume = () => {
                this.onResume = undefined;
                resolve();
            };
        });
    }

    private async resumeDecoderRun(): Promise<boolean> {
        while (!this.paused ) {
            const chunk = await this.demuxed.packets.pull();

            if (chunk === undefined) {
                return true; // EOF
            }

            this.decoder.decode(chunk);
        }

        return false;
    }

    async decode(): Promise<void> {
        for (let eof = await this.resumeDecoderRun(); !eof; eof = await this.resumeDecoderRun()) {
            await this.waitUntilResumed();
        }

        await this.decoder.flush();
        
        // We close the output frame stream after all frames were flushed.
        this.leader.enqueuePromise(async () => {
            this.framestream.close();
        });
    }
}