import { type AsyncEventEmitterDispatchFunction } from './types/async-event-emitter-dispatch-function.js';
import { type AsyncEventEmitterInitFunction } from './types/async-event-emitter-init-function.js';

export class AsyncEventEmitterInitializer<GValue> {
  readonly #init: AsyncEventEmitterInitFunction<GValue>;
  #dispatch!: AsyncEventEmitterDispatchFunction<GValue>;

  constructor() {
    this.#init = (dispatch: AsyncEventEmitterDispatchFunction<GValue>): void => {
      this.#dispatch = dispatch;
    };
  }

  get init(): AsyncEventEmitterInitFunction<GValue> {
    return this.#init;
  }

  get dispatch(): AsyncEventEmitterDispatchFunction<GValue> {
    return this.#dispatch;
  }
}
