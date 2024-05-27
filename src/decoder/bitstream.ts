import { EncodedVideoChunkTransformer } from "./chunk-transformer";
import { AvcNalu, NalUnitType, isTypedNalu } from "./interfaces";
import { AvcNaluTransformer } from "./nalu-transformer";

import { parseSPS } from 'nal-extractor'

export class AvcBitstream {
    public readonly config: Promise<VideoDecoderConfig>;
    public readonly packets: ReadableStreamReader<EncodedVideoChunk>;

    constructor(
        h264File: Blob,
        hardwareAcceleration: HardwareAcceleration,
        frameRate: number
    ) {
        const [headerNALUs, remainingNALUs] = h264File.stream().pipeThrough<AvcNalu>(new TransformStream<Uint8Array, AvcNalu>(new AvcNaluTransformer())).tee();

        this.config = AvcBitstream.parseVideoDecoderConfig(headerNALUs, hardwareAcceleration);
        this.packets = remainingNALUs.pipeThrough<EncodedVideoChunk>(new TransformStream<AvcNalu, EncodedVideoChunk>(new EncodedVideoChunkTransformer(frameRate))).getReader();
    }

    /**
     * We read the first SPS NALU and construct the `VideoDecoderConfig` object from it.
     * 
     * SPS NALU @see https://www.cardinalpeak.com/blog/the-h-264-sequence-parameter-set
     * `codec` parameter @see https://www.rfc-editor.org/rfc/rfc6381#section-3
     * `codecWidth` and `codedHeight` parameters https://stackoverflow.com/questions/12018535/get-the-width-height-of-the-video-from-h-264-nalu
     */
    private static async parseVideoDecoderConfig(headerNALUs: ReadableStream<AvcNalu>, hardwareAcceleration: HardwareAcceleration): Promise<VideoDecoderConfig> {
        const reader = headerNALUs.getReader();

        for (let { value, done } = await reader.read(); value !== undefined && !done; { value, done } = await reader.read()) {
            if (isTypedNalu(value, NalUnitType.SEQUENCE_PARAMETER_SET)) {

                const { naluBody } = value;

                // The RBSP of a NALU begins after the first byte of its body
                const { 
                    profile_idc,
                    level_idc,
                    pic_width_in_mbs_minus1,
                    frame_mbs_only_flag,
                    pic_height_in_map_units_minus1,
                    frame_cropping,
                } = parseSPS(naluBody.subarray(1));

                return {
                    codec: `avc1.${profile_idc.toString(16).padStart(2, '0')}00${level_idc.toString(16).padStart(2, '0')}}`,
                    codedWidth: ((pic_width_in_mbs_minus1 + 1) * 16) - (frame_cropping === false ? 0 : (frame_cropping.right_offset * 2 + frame_cropping.left_offset * 2)),
                    codedHeight:  (2 - (frame_mbs_only_flag ? 1 : 0)) * ((pic_height_in_map_units_minus1 + 1) * 16) - (frame_cropping === false ? 0 : (frame_cropping.top_offset + frame_cropping.bottom_offset) * 2),
                    hardwareAcceleration,
                };
            }
        }

        throw new Error('Premature end of AVC bitstream before an SPS NALU was found');
    }

}