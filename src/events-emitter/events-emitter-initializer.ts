import {
  type EventsEmitterDispatchFunction,
  type EventsEmitterInitFunction,
} from './events-emitter.js';

export class EventsEmitterInitializer<GEventMap extends object> {
  readonly #init: EventsEmitterInitFunction<GEventMap>;
  #dispatch!: EventsEmitterDispatchFunction<GEventMap>;

  constructor() {
    this.#init = (dispatch: EventsEmitterDispatchFunction<GEventMap>): void => {
      this.#dispatch = dispatch;
    };
  }

  get init(): EventsEmitterInitFunction<GEventMap> {
    return this.#init;
  }

  get dispatch(): EventsEmitterDispatchFunction<GEventMap> {
    return this.#dispatch;
  }
}
