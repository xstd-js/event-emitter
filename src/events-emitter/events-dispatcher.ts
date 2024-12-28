import { EventsEmitter, EventsEmitterDispatchFunction } from './events-emitter.js';

export class EventsDispatcher<GEventMap extends object> {
  readonly #emitter: EventsEmitter<GEventMap>;
  #dispatch!: EventsEmitterDispatchFunction<GEventMap>;

  constructor() {
    this.#emitter = new EventsEmitter<GEventMap>(
      (dispatch: EventsEmitterDispatchFunction<GEventMap>): void => {
        this.#dispatch = dispatch;
      },
    );
  }

  get emitter(): EventsEmitter<GEventMap> {
    return this.#emitter;
  }

  get dispatch(): EventsEmitterDispatchFunction<GEventMap> {
    return this.#dispatch;
  }
}
