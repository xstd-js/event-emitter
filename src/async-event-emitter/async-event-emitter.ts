import { noop } from '@xstd/noop';
import { type UndoFunction } from '@xstd/undo-function';
import {
  type EventEmitterListenAfterUniqueDispatched,
  type EventEmitterOptions,
} from '../event-emitter/event-emitter.js';
import { checkMaxListeners } from '../shared/check-max-listeners.js';
import { type AsyncEventEmitterInitFunction } from './types/async-event-emitter-init-function.js';
import { type AsyncEventEmitterListener } from './types/async-event-emitter-listener.js';

/**
 * The optional options to provide to an async event emitter.
 */
export interface AsyncEventEmitterOptions extends EventEmitterOptions {}

/**
 * An async event emitter.
 */
export class AsyncEventEmitter<GValue> {
  static readonly #maxUnsubscribeCount: number = 0xff;

  // config
  readonly #maxListeners: number;
  readonly #unique: boolean;
  readonly #listenAfterUniqueDispatched?: EventEmitterListenAfterUniqueDispatched;

  // the list of listeners
  #listeners: AsyncEventEmitterListener<GValue>[];

  // the number of unsubscribed, but not cleared, listeners.
  #unsubscribeCount: number;
  // the number of times `#clear` has been called
  #clearCount: number;
  // the number of times `#dispatch` has been called
  #dispatchCount: number;
  // if we are dispatching
  #dispatching: boolean;

  constructor(
    init: AsyncEventEmitterInitFunction<GValue>,
    {
      maxListeners = 10,
      unique = false,
      listenAfterUniqueDispatched = 'default',
    }: AsyncEventEmitterOptions = {},
  ) {
    this.#maxListeners = maxListeners;
    this.#unique = unique;
    this.#listenAfterUniqueDispatched = listenAfterUniqueDispatched;
    this.#listeners = [];
    this.#unsubscribeCount = 0;
    this.#clearCount = 0;
    this.#dispatchCount = 0;
    this.#dispatching = false;

    init((value: GValue): Promise<void> => {
      return this.#dispatch(value);
    });
  }

  #isUniqueAndDone(): boolean {
    return this.#unique && this.#dispatchCount !== 0;
  }

  #clearIfMaxUnsubscribeCountIsReached(): void {
    if (this.#unsubscribeCount >= AsyncEventEmitter.#maxUnsubscribeCount) {
      this.#clear();
    }
  }

  #clear(): void {
    this.#unsubscribeCount = 0;
    this.#clearCount++;
    this.#listeners = this.#listeners.filter(
      (listener: AsyncEventEmitterListener<GValue>): boolean => {
        return listener !== noop;
      },
    );
  }

  async #dispatch(value: GValue): Promise<void> {
    if (this.#dispatching) {
      throw new Error('Dispatch loop detected.');
    }

    if (this.#isUniqueAndDone()) {
      throw new Error('Event already emitted.');
    }

    this.#dispatching = true;
    this.#dispatchCount++;

    const promises: Promise<void>[] = [];

    for (let i: number = 0; i < this.#listeners.length; i++) {
      const result: Promise<void> | void = this.#listeners[i](value);
      if (result !== undefined) {
        promises.push(result);
      }
    }

    if (this.#unique) {
      this.#clearCount = 1;
      this.#listeners = [];
    } else {
      this.#clearIfMaxUnsubscribeCountIsReached();
    }

    this.#dispatching = false;

    const results: PromiseSettledResult<void>[] = await Promise.allSettled(promises);

    const errors: unknown[] = [];
    for (let i: number = 0; i < results.length; i++) {
      const result: PromiseSettledResult<void> = results[i];
      if (result.status === 'rejected') {
        errors.push(result.reason);
      }
    }

    if (errors.length > 0) {
      throw errors.length === 1 ? errors[0] : new AggregateError(errors);
    }
  }

  /**
   * Listens on events sent by this emitter.
   *
   * @param listener A function called when an event is dispatched.
   * @returns {UndoFunction} A function to call to "stop" the listener.
   */
  listen(listener: AsyncEventEmitterListener<GValue>): UndoFunction {
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

  /**
   * Returns a Promise resolved when the "next" event is received.
   * @param signal An optional AbortSignal to stop awaiting this event.
   */
  untilNext(signal?: AbortSignal): Promise<GValue> {
    return new Promise<GValue>(
      (resolve: (value: GValue) => void, reject: (reason?: any) => void): void => {
        signal?.throwIfAborted();

        const end = (): void => {
          undoSelfListener();
          signal?.removeEventListener('abort', onAbort);
        };

        const onAbort = (): void => {
          end();
          reject(signal!.reason);
        };

        const undoSelfListener: UndoFunction = this.listen((value: GValue): void => {
          end();
          resolve(value);
        });

        signal?.addEventListener('abort', onAbort);
      },
    );
  }

  async *[Symbol.asyncIterator](signal?: AbortSignal): AsyncGenerator<GValue> {
    while (true) {
      yield this.untilNext(signal);
    }
  }
}
