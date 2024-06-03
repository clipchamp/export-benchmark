const AZURE_BLOBSTORE_ENDPOINT = 'https://exportperformance.blob.core.windows.net';
const AZURE_BLOBSTORE_CONTAINER = 'videos';

const CACHED_VIDEO_FILES: { [ fileName: string]: File } = {};

export async function loadInputFile(inputFileName: string, progressCallback?: (progress: number) => void): Promise<File> {
    if (inputFileName in CACHED_VIDEO_FILES) {
        if (progressCallback !== undefined) {
            progressCallback(1);
        }
        return CACHED_VIDEO_FILES[inputFileName];
    }

    const response = await fetch(`${AZURE_BLOBSTORE_ENDPOINT}/${AZURE_BLOBSTORE_CONTAINER}/${inputFileName}`);

    if (!response.ok) {
        throw new Error(`Cannot load input file: HTTP/${response.status}`);
    }

    if (response.body === null) {
        throw new Error(`HTTP response from Azure blob store has no body`);
    }

    const fileSize = Number.parseInt(response.headers.get('Content-Length')!);

    const reader = response.body.getReader();

    const chunks: Uint8Array[] = [];
    let length = 0;

    for (let { done, value } = await reader.read(); !done; { done, value } = await reader.read()) {
        if (value !== undefined) {
            length += value.byteLength;
            chunks.push(value);

            if (progressCallback !== undefined) {
                progressCallback(length / fileSize);
            }
        }
    }

    const file = new File(chunks, inputFileName, { type: response.headers.get('Content-Type') ?? 'video/mp4' });
    CACHED_VIDEO_FILES[inputFileName] = file;
    return file;
}
