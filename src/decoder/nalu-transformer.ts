import { searchPattern, startsWith } from "./array-utils";
import { AvcNalu, NalUnitType, NALU_SHORT_PREFIX, NALU_LONG_PREFIX } from "./interfaces";

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
        // Find start positions of NALUs with long 0001 start marker in chunk 
        const longPositions = searchPattern<number>(chunk, NALU_LONG_PREFIX);

        // Find start positions of NALUs with short 001 start marker in chunk (excluding the ones where the short start marker is
        // actually the end of a long start marker.
        const shortPositions = searchPattern<number>(chunk, NALU_SHORT_PREFIX).filter(position => !longPositions.includes(position - 1))

        const positions = [...longPositions, ...shortPositions].sort((a, b) => a - b);

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
        ].filter(nalu => nalu.byteLength > 0);

        // The last NALU start marker demarcates the start of an assumed unfinished NALU.
        this.buffered.splice(0, this.buffered.length, chunk.subarray(positions[positions.length - 1]));

        return nalus;
    }

    private static removeNaluStartMarker(naluPayload: Uint8Array): Uint8Array {
        return naluPayload.subarray(startsWith(naluPayload, NALU_LONG_PREFIX) ? NALU_LONG_PREFIX.length : NALU_SHORT_PREFIX.length);
    }

    async transform(chunk: Uint8Array, controller: TransformStreamDefaultController<AvcNalu>): Promise<void> {
        const nalus = await this.extractNalus(chunk);

        nalus.forEach(completeNalu => {
            const naluBody = AvcNaluTransformer.removeNaluStartMarker(completeNalu)

            const { naluType, refIdc } = AvcNaluTransformer.parseNalu(naluBody);

            controller.enqueue({ naluType, refIdc, naluBody, completeNalu });
        });
    }

    async flush(controller: TransformStreamDefaultController<AvcNalu>): Promise<void> {
        const completeNalu = new Uint8Array(await new Blob(this.buffered).arrayBuffer());

        const naluBody = AvcNaluTransformer.removeNaluStartMarker(completeNalu)
        const { naluType, refIdc } = AvcNaluTransformer.parseNalu(naluBody);

        this.buffered.splice(0, this.buffered.length);

        controller.enqueue({ naluType, refIdc, naluBody, completeNalu });
        controller.terminate();
    }
}