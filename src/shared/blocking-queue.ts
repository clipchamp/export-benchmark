export interface ReadQueue<T> {
    pull(): Promise<T | undefined>;
}

export interface WriteQueue<T> {
    push(value: T): Promise<void>;
    close(): void;
}

export class BlockingQueue<T> implements ReadQueue<T>, WriteQueue<T> {
    private closed = false;
    private buffered: T[] = [];

    private blockedPull?: (value: T | undefined) => void;
    private blockedPush?: () => void;

    /**
     * Callback that gets invoked when a pull lowers the internal buffer size below the configured capacity, such that
     * subseqent pulls can be performed without blocking.
     */
    onSpareCapacity?: (spareCapacity: number) => void;

    constructor(private readonly capacity: number) {
        if (this.capacity < 1) {
            throw new Error(`Capacity must be at least 1 (is ${this.capacity})`);
        }
    }

    /**
     * Returns the number of pushes that can be performed without blocking (more if there are intermittent pulls).
     */
    get spareCapacity(): number {
        return this.capacity - this.buffered.length;
    }

    private maybeUnblockPull(value: T): boolean {
        if (this.blockedPull === undefined) {
            return false;
        }

        const currentlyBlockedPull = this.blockedPull;
        this.blockedPull = undefined;
        currentlyBlockedPull(value);
        return true;
    }

    async push(value: T): Promise<void> {
        if (this.closed) {
            throw new Error('Cannot push into closed queue');
        }

        if (this.maybeUnblockPull(value)) {
            return;
        }

        this.buffered.push(value);

        if (this.buffered.length > this.capacity) {
            await new Promise<void>(resolve => {
                this.blockedPush = resolve;
            });
        }
    }

    private maybeUnblockPush(): void {
        if (this.blockedPush === undefined) {
            return;
        }

        const currentlyBlockedPush = this.blockedPush;
        this.blockedPush = undefined;
        currentlyBlockedPush();
    }

    async pull(): Promise<T | undefined> {
        const value = this.buffered.shift();

        this.maybeUnblockPush();

        if (value === undefined) {
            if (this.closed) {
                return undefined;
            }

            return await new Promise<T | undefined>(resolve => {
                this.blockedPull = resolve;
            });
        }

        return value;
    }

    close(): void {
        this.closed = true;

        if (this.blockedPull !== undefined) {
            this.blockedPull(undefined);
        }
    }
}