export interface EventEmitterDispatchFunction<GValue> {
  (value: GValue): void;
}
