import { AsyncEventEmitter, type AsyncEventEmitterOptions } from './async-event-emitter.js';
import { type AsyncEventEmitterDispatchFunction } from './types/async-event-emitter-dispatch-function.js';

export class AsyncEventDispatcher<GValue> {
  readonly #emitter: AsyncEventEmitter<GValue>;
  #dispatch!: AsyncEventEmitterDispatchFunction<GValue>;

  constructor(options?: AsyncEventEmitterOptions) {
    this.#emitter = new AsyncEventEmitter<GValue>(
      (dispatch: AsyncEventEmitterDispatchFunction<GValue>): void => {
        this.#dispatch = dispatch;
      },
      options,
    );
  }

  get emitter(): AsyncEventEmitter<GValue> {
    return this.#emitter;
  }

  get dispatch(): AsyncEventEmitterDispatchFunction<GValue> {
    return this.#dispatch;
  }
}
