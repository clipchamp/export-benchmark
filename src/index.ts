import 'bootstrap/dist/css/bootstrap.min.css'
import { AvcBitstream } from "./decoder/bitstream";

console.log('Hello world');

const DEFAULT_FRAMERATE = 30;

new AvcBitstream(new File(['abc'], 'hooha.h264'), 'prefer-hardware', DEFAULT_FRAMERATE);