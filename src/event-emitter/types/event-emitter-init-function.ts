import { type EventEmitterDispatchFunction } from './event-emitter-dispatch-function.js';

export interface EventEmitterInitFunction<GValue> {
  (dispatch: EventEmitterDispatchFunction<GValue>): void;
}
