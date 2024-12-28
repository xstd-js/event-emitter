export interface AsyncEventEmitterListener<GValue> {
  (value: GValue): Promise<void> | void;
}
