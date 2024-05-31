import { ArrayBufferWithFileStart, DataStream, MP4BoxFile, MP4Sample, VideoTrack, createFile } from 'mp4box';
import { ControllablePromise } from '../shared/controllable-promise';
import { BlockingQueue, ReadQueue } from '../shared/blocking-queue';
import { LeaderFollowerQueue } from '../shared/leader-follower';

const FILE_READ_HIGH_WATERMARK = 10;
const BITSTREAM_WRITE_HIGH_WATERMARK = 10;
const ONE_SECOND_IN_MICROS = 1e6;

export class Mp4Demuxer {
    private readonly demuxer = createFile();
    private readonly leader = new LeaderFollowerQueue();
    private readonly bitstream = new BlockingQueue<EncodedVideoChunk>(BITSTREAM_WRITE_HIGH_WATERMARK);

    public readonly config: Promise<VideoDecoderConfig>;
    
    get packets(): ReadQueue<EncodedVideoChunk> {
        return this.bitstream;
    }

    private getDescription(track: VideoTrack, demuxer: MP4BoxFile): Uint8Array {
        const trak = demuxer.getTrackById(track.id);

        if (trak === undefined) {
            throw new Error(`No track with id ${track.id}`);
        }

        for (const entry of trak.mdia.minf.stbl.stsd.entries) {
            const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;

            if (box !== undefined) {
                const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                box.write(stream);
                return new Uint8Array(stream.buffer, box.hdr_size);
            }
        }

        throw new Error('No AVC, HEVC, VPx or AV1 media entry found in STSD atom');
    }

    private async configureFilePlumbing(mp4File: Blob): Promise<void> {
        const fileQueue = new BlockingQueue<Uint8Array>(FILE_READ_HIGH_WATERMARK);

        mp4File.stream().pipeTo(new WritableStream({
            async write(chunk: Uint8Array): Promise<void> {
                await fileQueue.push(chunk);
            },
            close(): void {
                fileQueue.close();
            }
        }));

        let offset = 0;

        for (let chunk = await fileQueue.pull(); chunk !== undefined; chunk = await fileQueue.pull()) {
            const buffer = new ArrayBuffer(chunk.byteLength) as ArrayBufferWithFileStart;
            new Uint8Array(buffer).set(chunk);
            buffer.fileStart = offset;
            offset += buffer.byteLength;
            
            this.demuxer.appendBuffer(buffer);
        }

        // Flushing the demuxer will call the onSamples callback, which will
        // push out the remaining samples.
        this.demuxer.flush();

        // We make sure to close the bitstream after all samples have been processed.
        this.leader.enqueuePromise(async () => {
            this.bitstream.close();
        });
    }

    constructor(mp4File: Blob, hardwareAcceleration: HardwareAcceleration) {
        this.configureFilePlumbing(mp4File);

        const config = new ControllablePromise<VideoDecoderConfig>();
        this.config = config.promise;

        this.demuxer.onSamples = async (_trackId, _userData, samples) => {
            // There is no way to apply back-pressure to the MP4Box demuxer. So we
            // have to queue the samples.
            this.leader.enqueuePromise<void>(async () => {
                for (const sample of samples) {
                    await this.bitstream.push(new EncodedVideoChunk({
                        type: sample.is_sync ? 'key' : 'delta',
                        timestamp: ONE_SECOND_IN_MICROS * sample.cts / sample.timescale,
                        duration: ONE_SECOND_IN_MICROS * sample.duration / sample.timescale,
                        data: sample.data
                    }));
                }
            });
        };

        this.demuxer.onReady = info => {
            const track = info.videoTracks[0];

            if (track === undefined) {
                config.reject(new Error('No video tracks in MP4 file'));
                return;
            }

            config.resolve({
                codec: track.codec,
                codedWidth: track.video.width,
                codedHeight: track.video.height,
                description: this.getDescription(track, this.demuxer),
                hardwareAcceleration,
            });

            this.demuxer.setExtractionOptions(track.id, undefined, {});
            this.demuxer.start();
        };

        this.demuxer.onError = reason => {
            alert(`Demuxer error: ${reason}`);
            config.reject(new Error(reason));
        };
    }
}