import { cacheFile, lookupFile } from "./file-cache";

const AZURE_BLOBSTORE_ENDPOINT = 'https://exportperformance.blob.core.windows.net';
const AZURE_BLOBSTORE_CONTAINER = 'videos';

export async function loadInputFile(inputFileName: string, progressCallback: (loaded: number, size: number) => void): Promise<File> {
    const cachedFile = await lookupFile(inputFileName);

    if (cachedFile !== undefined) {
        progressCallback(cachedFile.size, cachedFile.size);
        return cachedFile;
    }

    const response = await fetch(`${AZURE_BLOBSTORE_ENDPOINT}/${AZURE_BLOBSTORE_CONTAINER}/${inputFileName}`);

    if (!response.ok) {
        throw new Error(`Cannot load input file: HTTP/${response.status}`);
    }

    if (response.body === null) {
        throw new Error(`HTTP response from Azure blob store has no body`);
    }

    const fileSize = Number.parseInt(response.headers.get('Content-Length')!);
    progressCallback(0, fileSize);

    const reader = response.body.getReader();

    const chunks: Uint8Array[] = [];
    let length = 0;

    for (let { done, value } = await reader.read(); !done; { done, value } = await reader.read()) {
        if (value !== undefined) {
            length += value.byteLength;
            chunks.push(value);

            progressCallback(length, fileSize);
        }
    }

    const downloadedFile = new File(chunks, inputFileName, { type: response.headers.get('Content-Type') ?? 'video/mp4' });

    await cacheFile(downloadedFile);

    return downloadedFile;
}
