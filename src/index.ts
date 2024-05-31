import 'bootstrap/dist/css/bootstrap.min.css'
import $ from 'jquery';
import { Mp4Demuxer } from './decoder/mp4-demuxer';
import { H264Decoder } from './decoder/h264-decoder';
import { H264Encoder } from './encoder/h264-encoder';
import { EncoderResolution, H264Profile } from './encoder/interfaces';

const DEFAULT_FRAMERATE = 30;

async function loadInputFile(inputFileName: string): Promise<File> {
    const response = await fetch(`resources/videos/${inputFileName}`);

    if (!response.ok) {
        throw new Error(`Cannot load input file: HTTP/${response.status}`);
    }

    const blob = await response.blob();

    return new File([blob], inputFileName)
}

const TOTAL_TIME_MICROS = 596380000; 

const encoderProgressControl = $('#encoder-progress');
const exportTimeText = $('#export-time');
const outputSizeText = $('#output-size');

function setProgress(timestampMicros: number, durationSeconds: number, outputSizeBytes: number): void {
    encoderProgressControl.css('width', `${Math.round(timestampMicros / TOTAL_TIME_MICROS * 100)}%`);
    exportTimeText.text(`${durationSeconds.toFixed(3)}`);
    outputSizeText.text(`${outputSizeBytes}`);
}

$('button#run-benchmark').click(async () => {
    $('button#run-benchmark').attr('disabled', 'disabled');
    $('select').attr('disabled', 'disabled');
    $('input').attr('disabled', 'disabled');
    
    const inputFileName = $('select#input-file').val() as string;
    const decoderAcceleration = $('select#decoder-acceleration').val() as HardwareAcceleration;
    const decoderCanvas = $('canvas#decoder-canvas')[0] as HTMLCanvasElement;
    const decoderContext = decoderCanvas.getContext('2d');
    const showDecoderOutput = $('input#decoder-output:checked').val() === 'on';

    const outputResolution = $('select#output-resolution').val() as EncoderResolution;
    const h264Profile = $('select#h264-profile').val() as H264Profile;
    const hardwareAcceleration = $('select#encoder-acceleration').val() as HardwareAcceleration;
    const bitrate = Number.parseInt($('input#encoding-bitrate').val() as string);
    const bitrateMode = $('select#bitrate-mode').val() as VideoEncoderBitrateMode;
    const latencyMode = $('select#latency-mode').val() as LatencyMode;
    const showEncodingProgress = $('input#progress-update:checked').val() === 'on';

    exportTimeText.val('Loading video.');
    outputSizeText.text('0');

    const inputFile = await loadInputFile(inputFileName);
    exportTimeText.val('Running...');

    const startTimeMillis = performance.now();

    const demuxer = new Mp4Demuxer(inputFile, decoderAcceleration);
    const config = await demuxer.config;
    const decoder = new H264Decoder({ config, packets: demuxer.packets });

    let outputSizeBytes = 0;
    let encodedPackets = 0;
    let decodedFrames = 0;

    const encoder = new H264Encoder(
        decoder.frames,
        frame => {
            ++decodedFrames;
            if (showDecoderOutput && decoderContext !== null) {
                decoderContext.drawImage(frame, 0, 0, decoderCanvas.width, decoderCanvas.height);
            }
        },
        h264Profile,
        outputResolution,
        {
            framerate: DEFAULT_FRAMERATE,
            hardwareAcceleration,
            bitrate,
            bitrateMode,
            latencyMode
        }
    );

    for (let packet = await encoder.packets.pull(); packet !== undefined; packet = await encoder.packets.pull()) {
        const { chunk } = packet;
        
        outputSizeBytes += chunk.byteLength;
        ++encodedPackets;

        if (showEncodingProgress) {
            setProgress(chunk.timestamp, performance.now() - startTimeMillis, outputSizeBytes);
        }
    }

    const durationSeconds = (performance.now() - startTimeMillis) / 1000;

    setProgress(0, durationSeconds, outputSizeBytes);
    alert(`Benchmark finished in ${durationSeconds.toFixed(3)} seconds.\n${decodedFrames} frames decoded, ${encodedPackets} packets encoded (${outputSizeBytes} bytes).`);
    $('button#run-benchmark').removeAttr('disabled');
    $('select').removeAttr('disabled');
    $('input').removeAttr('disabled');
});
