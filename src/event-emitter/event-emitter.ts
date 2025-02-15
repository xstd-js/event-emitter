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
