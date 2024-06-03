const DEFAULT_QUOTA = 2 * 1024 * 1024 * 1024; // 2 GB
const INMEMORY_CACHE: { [ fileName: string]: File} = {};

interface WindowWithFileSystem extends Window {
    readonly TEMPORARY: number;
    readonly PERSISTENT: number;

    webkitRequestFileSystem(
        type: WindowWithFileSystem["PERSISTENT"] | WindowWithFileSystem["TEMPORARY"],
        size: number,
        successCallback: (fs: FileSystem) => void,
        errorCallback: (error: Error) => void
    ): void;
}

function isWindowWithFileSystem(window: Window): window is WindowWithFileSystem {
    return (
        'TEMPORARY' in window && typeof window.TEMPORARY === 'number' &&
        'PERSISTENT' in window && typeof window.PERSISTENT === 'number' &&
        'webkitRequestFileSystem' in window && typeof window.webkitRequestFileSystem === 'function'
    );
}

export interface FileWriter {
    seek(position: number): void;
    write(data: Blob): void;
    truncate(length: number): void;

    onabort: null | ((event: Event) => void);
    onerror: null | ((event: Event) => void);
    onwrite: null | ((event: Event) => void);
    onwriteend: null | ((event: Event) => void);
}

interface FileSystemFileEntryWithWriter extends FileSystemFileEntry {
    createWriter(sucessCallback: (writer: FileWriter) => void, errorCallback: (error: Error) => void): void;
}

function isFileSystemFileEntryWithWriter(entry: FileSystemFileEntry): entry is FileSystemFileEntryWithWriter {
    return 'createWriter' in entry && typeof entry.createWriter === 'function';
}


function requestFileSystem(window: WindowWithFileSystem): Promise<FileSystem> {
    return new Promise<FileSystem>((resolve, reject) => {
        window.webkitRequestFileSystem(window.TEMPORARY, DEFAULT_QUOTA, resolve, reject);
    });
}

export async function lookupFile(name: string): Promise<File | undefined> {
    if (!isWindowWithFileSystem(window)) {
        return INMEMORY_CACHE[name];
    }

    const fs = await requestFileSystem(window);

    const entry = await new Promise<FileSystemFileEntry | undefined>((resolve, reject) => {
        fs.root.getFile(name, {
            create: false,
        }, entry => {
            if (entry.isFile) {
                resolve(entry as FileSystemFileEntry);
            } else {
                reject(new Error(`Requested to lookup file "${name}", which is a directory.`))
            }
        }, error => {
            console.warn(`Error looking up file ${name}: ${error.message}`);
            resolve(undefined);
        });
    });

    if (entry === undefined) {
        // Not found in cache
        return undefined;
    }

    return await new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
    });
}

export async function cacheFile(file: File): Promise<void> {
    if (!isWindowWithFileSystem(window)) {
        INMEMORY_CACHE[file.name] = file;
        return;
    }

    const fs = await requestFileSystem(window);

    const entry = await new Promise<FileSystemFileEntry>((resolve, reject) => {
        fs.root.getFile(file.name, {
            create: true,
            exclusive: false,
        }, entry => {
            if (entry.isFile) {
                resolve(entry as FileSystemFileEntry);
            } else {
                reject(new Error(`Requested to create file "${file.name}", got a non-file instead.`))
            }
        }, reject);
    });

    if (!isFileSystemFileEntryWithWriter(entry)) {
        throw new Error('Incomplete legacy FileSystem API - cannot create writer');
    }

    const writer = await new Promise<FileWriter>((resolve, reject) => {
        entry.createWriter(resolve, reject);
    });

    await new Promise<void>((resolve, reject) => {
        writer.onerror = event => {
            console.error('Error caching file', event);
            reject(new Error(`Error caching file: ${event}`));
        };

        writer.onwrite = () => {
            resolve();
        };

        writer.seek(0);
        writer.write(file);
    });
}