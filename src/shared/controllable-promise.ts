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

    private readonly _promise: Promise<T>;
    private _reject!: (reason?: Error) => void;
    private _resolve!: (value: T) => void;

    private _status: SynchronousPromiseStatus = 'pending';

    constructor() {
        this._promise = new Promise((resolve, reject) => {
            this._resolve = value => {
                this._status = 'resolved';
                resolve(value);
            };
            this._reject = error => {
                this._status = 'rejected';
                reject(error);
            };
        });
    }
}
