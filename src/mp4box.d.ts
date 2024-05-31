declare module "mp4box" {
    interface GenericTrack {
        readonly id: number;
        readonly codec: string;
        readonly duration: number;
        readonly bitrate: number;

        readonly created?: string;
        readonly modified?: string;
        readonly movie_duration?: number;
        readonly timescale?: number;
        readonly nb_samples?: number;
    }
    
    interface VideoTrack extends GenericTrack {
        readonly track_width: number;
        readonly track_height: number;

        readonly video: {
            readonly width: number;
            readonly height: number;
        };

        readonly layer?: number;
        readonly alternate_group?: number;
    }

    interface AudioTrack extends GenericTrack {
        readonly volume: number;

        readonly audio: {
            readonly sample_rate: number;
            readonly channel_count: number;
            readonly sample_size: number;
        };

        readonly language?: string;
    }

    type MP4Track = AudioTrack | VideoTrack;

    export interface MP4FileInfo {
        readonly duration: number;
        readonly timescale: number;
        readonly isFragmented: boolean;
        readonly isProgressive: boolean;
        readonly hasIOD: boolean;
        readonly brands: readonly string[];
        readonly created: string;
        readonly modified: string;

        readonly tracks: readonly MP4Track[];
        readonly videoTracks: readonly VideoTrack[];
        readonly audioTracks: readonly AudioTrack[];
    }

    interface MP4Atom<T extends string> {
        readonly type: T;
        readonly hdr_size: number;
        readonly start: number;
        readonly size: number;

        write(stream: DataStream): void;
    }

    /**
     * Sample description atom
     * 
     * @see https://developer.apple.com/documentation/quicktime-file-format/sample_description_atom
     */
    interface StsdAtom extends MP4Atom<'stsd'> {
        readonly flags: number;
        readonly version: number;
        readonly entries: {
            readonly avcC?: MP4Atom<'avcC'>;
            readonly hvcC?: MP4Atom<'hvcC'>;
            readonly vpcC?: MP4Atom<'vpcC'>;
            readonly av1C?: MP4Atom<'av1C'>;
        }[];
    }

    interface StblAtom extends MP4Atom<'stbl'> {
        readonly stsd: StsdAtom;
    }

    interface MinfAtom extends MP4Atom<'minf'> {
        readonly stbl: StblAtom;
    }
    
    interface MdiaAtom extends MP4Atom<'mdia'> {
        readonly minf: MinfAtom;
    }

    interface TrakAtom extends MP4Atom<'trak'> {
        readonly mdia: MdiaAtom;
    }

    export interface ArrayBufferWithFileStart extends ArrayBuffer {
        /**
         * Indicates the 0-based position of the first byte of the buffer in the original file.
         */
        fileStart: number;
    }

    export interface MP4Sample {
        readonly track_id: number;
        readonly description: string;
        readonly is_sync: boolean;
        readonly dts: number;
        readonly cts: number;
        readonly duration: number;
        readonly size: number;
        readonly data: ArrayBuffer;
        readonly timescale: number;
    }
    
    export interface MP4BoxFile {
        /**
         * The `onMoovStart` callback is called when the 'moov' box is starting to be parsed. Depending on the download speed,
         * it may take a while to download the whole 'moov' box. The end of parsing is signaled by the {@link MP4BoxFile.onReady} callback.
         * 
         * @see https://www.npmjs.com/package/mp4box#onmoovstart
         */
        onMoovStart?: () => void;

        /**
         * The `onReady` callback is called when the the 'moov' box has been parsed, i.e. when the metadata about the file is parsed.
         * 
         * @see https://www.npmjs.com/package/mp4box#onreadyinfo
         */
        onReady?: (info: MP4FileInfo) => void;

        /**
         * Indicates that an error has occurred during the processing.
         * 
         * @see https://www.npmjs.com/package/mp4box#onerrore
         */
        onError?: (reason: string) => void;

        /**
         * Callback called when a set of samples is ready, according to the options passed in {@link MP4BoxFile.setExtractionOptions}.
         * 
         * @param trackId - the identifier of the track. 
         * @param user - the caller of the segmentation.
         * @param samples  - an array of samples.
         * 
         * @see https://www.npmjs.com/package/mp4box#onsamplesid-user-samples
         */
        onSamples?: (trackId: number, user: unknown, samples: MP4Sample[]) => void;

        /**
         * Provides an `ArrayBuffer` to parse from. The `ArrayBuffer` must have a `fileStart` (`Number`) property indicating the 0-based position
         * of first byte of the `ArrayBuffer` in the original file. Returns the offset (in the original file) that is expected to be the `fileStart`
         * value of the next buffer. This is particularly useful when the moov box is not at the beginning of the file.
         * 
         * @see https://www.npmjs.com/package/mp4box#appendbufferdata
         */
        appendBuffer(data: ArrayBufferWithFileStart): void;

        /**
         * Indicates that sample processing can start (segmentation or extraction). Sample data already received will be processed and new buffer
         * append operation will trigger sample processing as well.
         * 
         * @see https://www.npmjs.com/package/mp4box#start
         */
        start(): void;

        /**
         * Indicates that sample processing is stopped. Buffer append operations will not trigger calls to onSamples or onSegment.
         * 
         * @see https://www.npmjs.com/package/mp4box#stop
         */
        stop(): void;

        /**
         * Indicates that no more data will be received and that all remaining samples should be flushed in the segmentation or extraction process.
         */
        flush(): void;

        /**
         * Indicates that the next samples to process (for extraction or segmentation) start at the given time (in seconds).
         * 
         * @param time - time in seconds where the next samples start.
         * @param useRap - use previous random access point instead (defaults to `false`).
         * 
         * @returns The offset in the file of the next bytes to be provided via {@link MP4BoxFile.appendBuffer}.
         */
        seek(time: number, useRap: boolean): number;

        /**
         * Indicates that the track with the given `trackId` for which samples should be extracted, with the given options.
         * When samples are ready, the callback {@link MP4BoxFile.onSamples} is called with the `userData` parameter.
         * 
         * @param trackId - the identifier of the track for which samples shall be extracted. 
         * @param userData - some parameter to pass down to the {@link MP4BoxFile.onSamples} callback. 
         * @param options - the sample extraction options.
         * 
         * @see https://www.npmjs.com/package/mp4box#setextractionoptionstrack_id-user-options
         */
        setExtractionOptions(trackId: number, userData: unknown, options: {
            /**
             * The number of samples per callback call. If not enough data is received to extract the given
             * number of samples, the samples received so far are kept. Defaults to 1000.
             */
            readonly nbSamples?: number;

            /**
             * Indicates if sample arrays should start with a RAP. If not provided, the default is `true`.
             */
            readonly rapAlignement?: boolean;
        }): void;

        getTrackById(trackId: number): TrakAtom | undefined;
    }
    
    export const createFile: () => MP4BoxFile;

    interface DataStream {
        readonly byteLength: number;

        buffer: ArrayBuffer;
        dataView: DataView;
        byteOffset: number;

        getPosition(): number;
        seek(offset: number): void;
        isEof(): boolean;
    }

    var DataStream: {
        readonly BIG_ENDIAN: boolean;
        readonly LITTLE_ENDIAN: boolean;

        prototype: DataStream;
        new(buffer: ArrayBuffer | DataView | number | undefined, byteOffset: number, bigEndian: boolean): DataStream;
    }
}