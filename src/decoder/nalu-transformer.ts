import { searchPattern } from "./array-utils";
import { AvcNalu, NalUnitType, NALU_PREFIX } from "./interfaces";

export class AvcNaluTransformer implements Transformer<Uint8Array, AvcNalu> {
    private readonly buffered: Uint8Array[] = [];

    private static parseNalu(payload: Uint8Array): {
        naluType: NalUnitType;
        refIdc: number;
    } {
        return {
            naluType: payload[0] & 0x1f,
            refIdc: (payload[0] >> 5) & 0x03,
        };
    }

    private async extractNalus(
        chunk: Uint8Array,
    ): Promise<Uint8Array[]> {
        // Find start positions of NALUs in chunk
        const positions = searchPattern<number>(chunk, NALU_PREFIX);

        // No NALU start markers found in chunk. We append it to the (unfinished) buffered NALU
        if (positions.length === 0) {
            this.buffered.push(chunk);
            return [];
        }

        // We found at least one NALU start marker. This forms the end of the buffered NALU. The chunk may further contain more complete NALUs, which we
        // extract.
        const nalus = [
            new Uint8Array(await new Blob([...this.buffered, chunk.subarray(0, positions[0])]).arrayBuffer()),
            ...positions.slice(0, positions.length - 1).map((position, index) => chunk.subarray(position, positions[index + 1])),
        ];

        // The last NALU start marker demarcates the start of an assumed unfinished NALU.
        this.buffered.splice(0, this.buffered.length, chunk.subarray(positions[positions.length - 1]));

        return nalus;
    }

    start(): void {}

    async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<AvcNalu>): Promise<void> {
        const nalus = await this.extractNalus(chunk);

        nalus.forEach(naluPayload => {
            const naluBody = naluPayload.subarray(NALU_PREFIX.length);
            const { naluType, refIdc } = AvcNaluTransformer.parseNalu(naluBody);

            controller.enqueue({ naluType, refIdc, naluBody });
        });
    }

    async flush(controller: TransformStreamDefaultController<AvcNalu>): Promise<void> {
        const naluPayload = new Uint8Array(await new Blob(this.buffered).arrayBuffer());

        const naluBody = naluPayload.subarray(NALU_PREFIX.length);
        const { naluType, refIdc } = AvcNaluTransformer.parseNalu(naluBody);

        this.buffered.splice(0, this.buffered.length);

        controller.enqueue({ naluType, refIdc, naluBody });
        controller.terminate();
    }
}