import { AvcNalu, NalUnitType } from "./interfaces";

const ONE_SECOND_IN_MICROS = 1e6;   

export class EncodedVideoChunkTransformer implements Transformer<AvcNalu, EncodedVideoChunk> {
    private seqno = 0;
    private readonly duration: number;

    /**
     * 
     * @param frameRate - the decoding frame rate of this stream in frames per second.
     */
    constructor(
        private readonly frameRate: number
    ) {
        this.duration = Math.floor(ONE_SECOND_IN_MICROS / frameRate);
    }

    private calculateFrameTimestamp(): number {
        return Math.floor(ONE_SECOND_IN_MICROS * (this.seqno ++) / this.frameRate);
    }

    start(): void {}

    transform({ naluType, naluBody, completeNalu }: AvcNalu, controller: TransformStreamDefaultController<EncodedVideoChunk>): void {
        if (naluType === NalUnitType.CODED_SLICE_IDR || naluType === NalUnitType.CODED_SLICE_NON_IDR) {
            controller.enqueue(new EncodedVideoChunk({
                data: completeNalu,
                type: naluType === NalUnitType.CODED_SLICE_IDR ? 'key' : 'delta',
                timestamp: this.calculateFrameTimestamp(),
                duration: this.duration,
            }));
        } else {
            controller.enqueue(undefined);
        }
    }
}