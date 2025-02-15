import { EventEmitter, type EventEmitterOptions } from './event-emitter.js';
import { type EventEmitterDispatchFunction } from './types/event-emitter-dispatch-function.js';

export class EventDispatcher<GValue> {
  readonly #emitter: EventEmitter<GValue>;
  #dispatch!: EventEmitterDispatchFunction<GValue>;

  constructor(options?: EventEmitterOptions) {
    this.#emitter = new EventEmitter<GValue>(
      (dispatch: EventEmitterDispatchFunction<GValue>): void => {
        this.#dispatch = dispatch;
      },
      options,
    );
  }

  get emitter(): EventEmitter<GValue> {
    return this.#emitter;
  }

  get dispatch(): EventEmitterDispatchFunction<GValue> {
    return this.#dispatch;
  }
}
