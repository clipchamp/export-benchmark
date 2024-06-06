const MAX_RECURSION_DEPTH = 10;
const DEFAULT_TIMEOUT_MILLIS = 5000;

type EnqueuedFunction = (nextCallback: () => void) => void;

interface IFunctionMetadata {
    id: number;
    func: EnqueuedFunction;
}

export class LeaderFollowerQueue {
    private functionIdSequence = 0;
    private readonly queue: IFunctionMetadata[] = [];
    private runningFunctionMetadata?: IFunctionMetadata;

    createPromise<T>(
        promiseCallback: (resolve: (result: T) => void, reject: (error: Error) => void) => void,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.enqueueFunction(async nextCallback => {
                try {
                    resolve(await new Promise<T>(promiseCallback));
                } catch (error) {
                    reject(error);
                } finally {
                    nextCallback();
                }
            });
        });
    }

    enqueuePromise<T>(callback: () => Promise<T>): Promise<T> {
        return this.createPromise<T>((resolve, reject) => {
            callback().then(resolve).catch(reject);
        });
    }

    enqueueFunction(enqueuedFunction: EnqueuedFunction): void {
        const newFunctionMetadata = {
            id: this.functionIdSequence++,
            func: enqueuedFunction,
        };

        if (this.runningFunctionMetadata === undefined) {
            this.runFunction(newFunctionMetadata);
        } else {
            this.queue.push(newFunctionMetadata);
        }
    }

    private unwindQueueRecursively(newRecursionDepth: number): void {
        const functionMetadata = this.queue.shift();
        if (functionMetadata !== undefined) {
            this.runFunction(functionMetadata, newRecursionDepth);
        } else {
            this.runningFunctionMetadata = undefined;
        }
    }

    private processQueueNext(currentRecursionDepth: number): void {
        if (currentRecursionDepth > MAX_RECURSION_DEPTH) {
            // We have exceeded the maximum synchronous call stack size and
            // become asynchronous, resetting the recursion depth to 0.
            setTimeout(() => {
                this.unwindQueueRecursively(0);
            });
        } else {
            // We have not yet reached the maximum synchronous call stack size and
            // call the function synchronously.
            this.unwindQueueRecursively(currentRecursionDepth + 1);
        }
    }

    private runFunction(currentFunctionMetadata: IFunctionMetadata, newRecursionDepth = 0): void {
        let hasCalledBack = false;

        this.runningFunctionMetadata = currentFunctionMetadata;

        this.runningFunctionMetadata.func(() => {
            if (hasCalledBack) {
                console.warn(
                    `Function ${currentFunctionMetadata.id} (${currentFunctionMetadata.func.name}) has already signalled completion before`
                );
            } else {
                hasCalledBack = true;
                this.processQueueNext(newRecursionDepth);
            }
        });
    }
}
