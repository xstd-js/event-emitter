import { type EventEmitterDispatchFunction } from './types/event-emitter-dispatch-function.js';
import { type EventEmitterInitFunction } from './types/event-emitter-init-function.js';

export class EventEmitterInitializer<GValue> {
  readonly #init: EventEmitterInitFunction<GValue>;
  #dispatch!: EventEmitterDispatchFunction<GValue>;

  constructor() {
    this.#init = (dispatch: EventEmitterDispatchFunction<GValue>): void => {
      this.#dispatch = dispatch;
    };
  }

  get init(): EventEmitterInitFunction<GValue> {
    return this.#init;
  }

  get dispatch(): EventEmitterDispatchFunction<GValue> {
    return this.#dispatch;
  }
}
