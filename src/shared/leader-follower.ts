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

    /**
     * Enqueues a function with a promise callback signature and returns a promise. The
     * enqueued function is called with a resolve and a reject callback that (1) forward the queue
     * to the next queued function and (2) resolves/rejects the returned promise, respectively.
     *
     * A timeout for when the function automatically rejects and skips to the next queued function
     * can be passed in, where a value of 0 signals that no timeout shall be enforced.
     *
     * @param promiseCallback - a promise callback function that receives a "resolve" and "reject" function parameters.
     * @param timeoutMillis - a timeout in milliseconds, where 0 signals that no timeout shall be enforced.
     * @param errorMessage - an optional error message that used for the exception that is produced when a timeout is triggered.
     *
     * @returns a promise that resolves (rejects) after the provided callback was called and has called its
     * resolve (reject) parameter, respectively.
     */
    createTimedPromise<T>(
        promiseCallback: (resolve: (result: T) => void, reject: (error: Error) => void) => void,
        timeoutMillis: number = DEFAULT_TIMEOUT_MILLIS,
        errorMessage?: string
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.enqueueFunction(async nextCallback => {
                const timeoutId =
                    timeoutMillis > 0
                        ? setTimeout(() => {
                              nextCallback();
                              reject(
                                  new Error(
                                      errorMessage ||
                                          `Queued promise timed out after ${timeoutMillis} millis`
                                  )
                              );
                          }, timeoutMillis)
                        : undefined;

                try {
                    resolve(await new Promise<T>(promiseCallback));
                } catch (error) {
                    reject(error);
                } finally {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }

                    nextCallback();
                }
            });
        });
    }

    /**
     * Enqueues a function that returns a promise. This function is only called when the
     * queue has finished processing any preceding (ie. ahead in queue) functions.
     * The queue skips ahead once the returned promise resolves or rejects. No timeout
     * is enforced.
     *
     * @param callback - a function that returns a promise. The function is only called once
     * the queue has finished any preceding functions.
     *
     * @returns a promise that resolves (rejects) after the promise the was returned by
     * the provided callback function resolves (rejects), respectively.
     */
    enqueuePromise<T>(callback: () => Promise<T>): Promise<T> {
        return this.createTimedPromise<T>((resolve, reject) => {
            callback().then(resolve).catch(reject);
        }, 0);
    }

    discardQueued(): void {
        this.queue.splice(0, this.queue.length);
    }

    enqueueFunction(enqueuedFunction: EnqueuedFunction): void {
        const newFunctionMetadata = {
            id: this.functionIdSequence++,
            func: enqueuedFunction,
        };

        if (this.isIdle()) {
            this.runFunction(newFunctionMetadata);
        } else {
            this.queue.push(newFunctionMetadata);
        }
    }

    getEnqueuedFunctions(): EnqueuedFunction[] {
        return this.queue.map(enqueued => enqueued.func);
    }

    isIdle(): boolean {
        return !this.runningFunctionMetadata;
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
