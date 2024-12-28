export interface AsyncEventEmitterDispatchFunction<GValue> {
  (value: GValue): Promise<void>;
}
