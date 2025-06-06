import { Abortable } from '@xstd/abortable';
import { noop } from '@xstd/noop';
import { type UndoFunction } from '@xstd/undo-function';
import { checkMaxListeners } from '../shared/check-max-listeners.js';
import { type EventEmitterInitFunction } from './types/event-emitter-init-function.js';
import { type EventEmitterListener } from './types/event-emitter-listener.js';

/**
 * The optional options to provide to an event emitter.
 */
export interface EventEmitterOptions {
  // maximum number of listeners: used to prevent memory leaks
  readonly maxListeners?: number;
  // if the event is dispatched only once
  readonly unique?: boolean;
  // what happen when the consumer "listen" on the EventEmitter, but its event is already dispatched.
  readonly listenAfterUniqueDispatched?: EventEmitterListenAfterUniqueDispatched;
}

export type EventEmitterListenAfterUniqueDispatched =
  | 'default' // ignore the listener
  | 'error'; // throw an error

export interface EventEmitterAsyncIteratorOptions extends Abortable {
  readonly bufferSize?: number;
  readonly windowTime?: number;
}

/**
 * A simple event emitter.
 *
 * @example
 *
 * Emits current timestamp every second.
 *
 * ```ts
 * const listener = new EventEmitter<number>((dispatch: EventEmitterDispatchFunction<number>): void => {
 *  setInterval((): void => {
 *    dispatch(Date.now());
 *  }, 1000);
 * })
 * ```
 */
export class EventEmitter<GValue> {
  static readonly #maxUnsubscribeCount: number = 0xff;

  // config
  readonly #maxListeners: number;
  readonly #unique: boolean;
  readonly #listenAfterUniqueDispatched?: EventEmitterListenAfterUniqueDispatched;

  // the list of listeners
  #listeners: EventEmitterListener<GValue>[];

  // the number of unsubscribed, but not cleared, listeners.
  #unsubscribeCount: number;
  // the number of times `#clear` has been called
  #clearCount: number;
  // the number of times `#dispatch` has been called
  #dispatchCount: number;
  // if we are dispatching
  #dispatching: boolean;

  constructor(
    init: EventEmitterInitFunction<GValue>,
    {
      maxListeners = 10,
      unique = false,
      listenAfterUniqueDispatched = 'default',
    }: EventEmitterOptions = {},
  ) {
    this.#maxListeners = maxListeners;
    this.#unique = unique;
    this.#listenAfterUniqueDispatched = listenAfterUniqueDispatched;
    this.#listeners = [];
    this.#unsubscribeCount = 0;
    this.#clearCount = 0;
    this.#dispatchCount = 0;
    this.#dispatching = false;

    init((value: GValue): void => {
      this.#dispatch(value);
    });
  }

  #isUniqueAndDone(): boolean {
    return this.#unique && this.#dispatchCount !== 0;
  }

  #clearIfMaxUnsubscribeCountIsReached(): void {
    if (this.#unsubscribeCount >= EventEmitter.#maxUnsubscribeCount) {
      this.#clear();
    }
  }

  #clear(): void {
    this.#unsubscribeCount = 0;
    this.#clearCount++;
    this.#listeners = this.#listeners.filter((listener: EventEmitterListener<GValue>): boolean => {
      return listener !== noop;
    });
  }

  #dispatch(value: GValue): void {
    if (this.#dispatching) {
      throw new Error('Dispatch loop detected.');
    }

    if (this.#isUniqueAndDone()) {
      throw new Error('Event already emitted.');
    }

    this.#dispatching = true;
    this.#dispatchCount++;

    for (let i: number = 0; i < this.#listeners.length; i++) {
      this.#listeners[i](value);
    }

    if (this.#unique) {
      this.#clearCount = 1;
      this.#listeners = [];
    } else {
      this.#clearIfMaxUnsubscribeCountIsReached();
    }

    this.#dispatching = false;
  }

  /**
   * Listens on events sent by this emitter.
   *
   * @param listener A function called when an event is dispatched.
   * @returns {UndoFunction} A function to call to "stop" the listener.
   */
  listen(listener: EventEmitterListener<GValue>): UndoFunction {
    if (this.#isUniqueAndDone()) {
      if (this.#listenAfterUniqueDispatched === 'error') {
        throw new Error('Event already emitted.');
      }
      return noop;
    } else {
      let index: number = this.#listeners.length;
      let clearCount: number = this.#clearCount;
      this.#listeners.push(listener);

      checkMaxListeners(this.#listeners.length, this.#maxListeners);

      return (): void => {
        if (index !== -1) {
          if (clearCount !== this.#clearCount) {
            index = this.#listeners.indexOf(listener);
            clearCount = this.#clearCount;
          }
          this.#listeners[index] = noop;
          index = -1;
          this.#clearIfMaxUnsubscribeCountIsReached();
        }
      };
    }
  }

  // listener(listener: EventEmitterListener<GValue>): Disposable {
  //   const undo: UndoFunction = this.listen(listener);
  //
  //   return {
  //     [Symbol.dispose]: undo,
  //   };
  // }

  /**
   * Returns a Promise resolved when the "next" event is received.
   * @param options An optional AbortSignal to stop awaiting this event.
   */
  untilNext({ signal }: Abortable = {}): Promise<GValue> {
    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const end = (): void => {
          stopSelfListener();
          signal?.removeEventListener('abort', onAbort);
        };

        const onAbort = (): void => {
          end();
          reject(signal!.reason);
        };

        const stopSelfListener: UndoFunction = this.listen((value: GValue): void => {
          end();
          resolve(value);
        });

        signal?.addEventListener('abort', onAbort);
      },
    );
  }

  async *toAsyncGenerator({
    bufferSize = Number.POSITIVE_INFINITY,
    windowTime = Number.POSITIVE_INFINITY,
    signal,
  }: EventEmitterAsyncIteratorOptions = {}): AsyncGenerator<GValue> {
    bufferSize = Math.max(0, bufferSize);
    windowTime = Math.max(0, windowTime);

    interface PendingValue {
      readonly value: GValue;
      readonly expirationDate: number;
    }

    const values: PendingValue[] = [];
    let pendingRead: PromiseWithResolvers<void> | undefined;

    using stack: DisposableStack = new DisposableStack();

    stack.defer(
      this.listen((value: GValue): void => {
        if (bufferSize > 0 && windowTime > 0) {
          values.push({
            value,
            expirationDate: Date.now() + windowTime,
          });

          if (values.length > bufferSize) {
            values.shift();
          }
        } else {
          if (pendingRead !== undefined) {
            values.length = 0;
            values.push({
              value,
              expirationDate: Number.POSITIVE_INFINITY,
            });
          }
        }

        if (pendingRead !== undefined) {
          pendingRead.resolve();
          pendingRead = undefined;
        }
      }),
    );

    while (true) {
      signal?.throwIfAborted();

      // remove the expired values
      const now: number = Date.now();
      while (values.length > 0 && values[0].expirationDate < now) {
        values.shift();
      }

      if (values.length > 0) {
        yield values.shift()!.value;
      } else {
        pendingRead = Promise.withResolvers<void>();

        const onAbort = (): void => {
          signal!.removeEventListener('abort', onAbort);
          pendingRead!.reject(signal!.reason);
          pendingRead = undefined;
        };

        signal?.addEventListener('abort', onAbort);

        try {
          await pendingRead.promise;
        } finally {
          signal?.removeEventListener('abort', onAbort);
        }
      }
    }
  }

  [Symbol.asyncIterator](): AsyncGenerator<GValue> {
    return this.toAsyncGenerator();
  }
}
