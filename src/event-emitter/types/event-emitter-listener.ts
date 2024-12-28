export interface EventEmitterListener<GValue> {
  (value: GValue): void;
}
