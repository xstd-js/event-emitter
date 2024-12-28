import { UndoFunction } from '@xstd/undo-function';
import { EventDispatcher } from '../event-emitter/event-dispatcher.js';

/** EVENTS EMITTER **/

/* TYPES */

// INIT
export interface EventsEmitterDispatchFunction<GEventMap extends object> {
  <GType extends keyof GEventMap>(type: GType, value: GEventMap[GType]): void;
}

export interface EventsEmitterInitFunction<GEventMap extends object> {
  (dispatch: EventsEmitterDispatchFunction<GEventMap>): void;
}

// ON
export interface EventsEmitterListener<GValue> {
  (value: GValue): void;
}

/* CLASS */

export class EventsEmitter<GEventMap extends object> {
  readonly #map: Map<keyof GEventMap, EventDispatcher<any>>;

  constructor(init: EventsEmitterInitFunction<GEventMap>) {
    this.#map = new Map<keyof GEventMap, EventDispatcher<any>>();

    init(<GType extends keyof GEventMap>(type: GType, value: GEventMap[GType]): void => {
      this.#map.get(type)?.dispatch(value);
    });
  }

  listen<GType extends keyof GEventMap>(
    type: GType,
    listener: EventsEmitterListener<GEventMap[GType]>,
  ): UndoFunction {
    let source: EventDispatcher<any> | undefined = this.#map.get(type);

    if (source === undefined) {
      source = new EventDispatcher<any>();
      this.#map.set(type, source);
    }

    return source.emitter.listen(listener);
  }

  untilNext<GType extends keyof GEventMap>(
    type: GType,
    signal?: AbortSignal,
  ): Promise<GEventMap[GType]> {
    type GValue = GEventMap[GType];

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

        const undoSelfListener: UndoFunction = this.listen(type, (value: GValue): void => {
          end();
          resolve(value);
        });

        signal?.addEventListener('abort', onAbort);
      },
    );
  }

  async *[Symbol.asyncIterator]<GType extends keyof GEventMap>(type: GType, signal?: AbortSignal) {
    while (true) {
      yield this.untilNext(type, signal);
    }
  }
}
