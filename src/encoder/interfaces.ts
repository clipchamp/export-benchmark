export const H264_PROFILES = {
    'baseline': 66,
    'main': 77,
    'high': 100
}

export type H264Profile = keyof typeof H264_PROFILES;

export const ENCODER_RESOLUTION = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '1440p': { width: 2560, height: 1440 },
    '4K': { width: 3840, height: 2160 },
}

export type EncoderResolution = keyof typeof ENCODER_RESOLUTION;

export type UncloggingMethod = 'dequeue_event' | 'polling_output' | 'flush_encoder';
