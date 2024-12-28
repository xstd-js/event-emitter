import { AsyncEventEmitterDispatchFunction } from './async-event-emitter-dispatch-function.js';

export interface AsyncEventEmitterInitFunction<GValue> {
  (dispatch: AsyncEventEmitterDispatchFunction<GValue>): void;
}
