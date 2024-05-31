type SynchronousPromiseStatus = 'pending' | 'resolved' | 'rejected';

export class ControllablePromise<T> {
    get promise(): Promise<T> {
        return this._promise;
    }

    get reject(): (reason?: Error) => void {
        return this._reject;
    }

    get resolve(): (value: T) => void {
        return this._resolve;
    }

    static from<T>(promise: Promise<T>): ControllablePromise<T> {
        return new ControllablePromise<T>((resolve, reject) => {
            promise.then(resolve).catch(reject);
        });
    }
    private readonly _promise: Promise<T>;
    private _reject!: (reason?: Error) => void;
    private _resolve!: (value: T) => void;

    private _status: SynchronousPromiseStatus = 'pending';

    constructor(
        promiseCallback?: (resolve: (value: T) => void, reject: (reason?: Error) => void) => void
    ) {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = value => {
                this._status = 'resolved';
                resolve(value);
            };
            this._reject = error => {
                this._status = 'rejected';
                reject(error);
            };
            if (promiseCallback) {
                promiseCallback(this._resolve, this._reject);
            }
        });
    }

    /**
     * Offers a way to synchronously "peek" the status of the controllable promise.
     * Will initially be "pending" and then flip into "resolved" or "rejected".
     */
    get status(): SynchronousPromiseStatus {
        return this._status;
    }

    always(callback: () => void): void {
        this._promise.then(callback, callback);
    }

    watch(promise: Promise<T>): Promise<void> {
        return promise.then(this._resolve).catch(this._reject);
    }
}
