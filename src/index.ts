import 'bootstrap/dist/css/bootstrap.min.css'
import $ from 'jquery';
import { Mp4Demuxer } from './decoder/mp4-demuxer';
import { H264Decoder } from './decoder/h264-decoder';
import { H264Encoder } from './encoder/h264-encoder';
import { EncoderResolution, H264Profile } from './encoder/interfaces';
import { loadInputFile } from './shared/input-files';

const DEFAULT_FRAMERATE = 30;
const TOTAL_TIME_MICROS = 596380000; 

const encoderProgressControl = $('#encoder-progress');
const exportTimeText = $('#export-time');
const outputSizeText = $('#output-size');
const decodedFramesText = $('#decoded-frames');
const encodedPacketsText = $('#encoded-packets');

function setExportProgress(timestampMicros: number, durationSeconds: number, outputSizeBytes: number, decodedFrames: number, encodedPackets: number): void {
    encoderProgressControl.css('width', `${Math.round(timestampMicros / TOTAL_TIME_MICROS * 100)}%`);
    exportTimeText.text(`${durationSeconds.toFixed(3)}`);
    outputSizeText.text(`${outputSizeBytes}`);
    decodedFramesText.text(`${decodedFrames}`);
    encodedPacketsText.text(`${encodedPackets}`);
}

const loadingProgressControl = $('#loading-progress');
const loadedBytesText = $('#loaded-bytes');
const totalBytesText = $('#total-bytes');

function setLoadingProgress(loadedBytes: number, totalBytes: number): void {
    if (totalBytes === 0) {
        loadingProgressControl.css('width', `0%`);
        loadedBytesText.text('-');
        totalBytesText.text('-');
    } else {
        loadingProgressControl.css('width', `${Math.round(loadedBytes / totalBytes * 100)}%`);
        loadedBytesText.text(`${loadedBytes}`);
        totalBytesText.text(`${totalBytes}`);
    }
}

$('button#run-benchmark').click(async () => {
    $('button#run-benchmark').attr('disabled', 'disabled');
    $('select').attr('disabled', 'disabled');
    $('input').attr('disabled', 'disabled');
    
    setExportProgress(0, 0, 0, 0, 0);
    setLoadingProgress(0, 0);

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


    const inputFile = await loadInputFile(inputFileName, setLoadingProgress);

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
            setExportProgress(chunk.timestamp, performance.now() - startTimeMillis, outputSizeBytes, decodedFrames, encodedPackets);
        }
    }

    const durationSeconds = (performance.now() - startTimeMillis) / 1000;

    setLoadingProgress(0, 0);
    setExportProgress(0, durationSeconds, outputSizeBytes, decodedFrames, encodedPackets);
    
    $('button#run-benchmark').removeAttr('disabled');
    $('select').removeAttr('disabled');
    $('input').removeAttr('disabled');
});
