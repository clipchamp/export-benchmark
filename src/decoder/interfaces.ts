export enum NalUnitType {
    UNSPECIFIED_1 = 0,
    CODED_SLICE_NON_IDR = 1,
    CODED_SLICE_DATA_PARTITION_A = 2,
    CODED_SLICE_DATA_PARTITION_B = 3,
    CODED_SLICE_DATA_PARTITION_C = 4,
    CODED_SLICE_IDR = 5,
    SUPPLEMENTAL_ENHANCEMENT_INFORMATION = 6,
    SEQUENCE_PARAMETER_SET = 7,
    PICTURE_PARAMETER_SET = 8,
    ACCESS_UNIT_DELIMITER = 9,
    END_OF_SEQUENCE = 10,
    END_OF_STREAM = 11,
    FILLER_DATA = 12,
    SEQUENCE_PARAMETER_SET_EXTENSION = 13,
    PREFIX_NAL_UNIT = 14,
    SUBSET_SEQUENCE_PARAMETER_SET = 15,
    RESERVED_1 = 16,
    RESERVED_2 = 17,
    RESERVED_3 = 18,
    CODED_SLICE_OF_AUXILIARY_CODED_PICTURE_WITHOUT_PARTITIONING = 19,
    CODED_SLICE_EXTENSION = 20,
    CODED_SLICE_EXTENSION_FOR_DEPTH_VIEW_COMPONENTS = 21,
    RESERVED_4 = 22,
    RESERVED_5 = 23,
    UNSPECIFIED_2 = 24,
    UNSPECIFIED_3 = 25,
    UNSPECIFIED_4 = 26,
    UNSPECIFIED_5 = 27,
    UNSPECIFIED_6 = 28,
    UNSPECIFIED_7 = 29,
    UNSPECIFIED_8 = 30,
    UNSPECIFIED_9 = 31,
}

export const NALU_PREFIX = [0x00, 0x00, 0x00, 0x01];

export interface AvcNalu<T extends NalUnitType = NalUnitType> {
    readonly naluType: T;
    readonly refIdc: number;
    readonly naluBody: Uint8Array;
}

export function isTypedNalu<T extends NalUnitType>(nalu: AvcNalu, type: T): nalu is AvcNalu<T> {
    return nalu.naluType === type;
}
