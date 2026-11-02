/**
 * A fast, bounded rolling ring buffer to store the most recent N lines of output
 * with zero heap bloat on runaway processes.
 */
export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private pointer: number = 0;
  private isFull: boolean = false;
  private totalPushedCount: number = 0;

  constructor(capacity: number = 1000) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  public push(item: T): void {
    this.buffer[this.pointer] = item;
    this.pointer = (this.pointer + 1) % this.capacity;
    this.totalPushedCount++;
    if (this.pointer === 0) {
      this.isFull = true;
    }
  }

  public toArray(): T[] {
    if (!this.isFull) {
      return this.buffer.slice(0, this.pointer) as T[];
    }
    const result: T[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.pointer + i) % this.capacity;
      const val = this.buffer[idx];
      if (val !== undefined) {
        result.push(val);
      }
    }
    return result;
  }

  public get totalPushed(): number {
    return this.totalPushedCount;
  }

  public clear(): void {
    this.buffer = new Array(this.capacity);
    this.pointer = 0;
    this.isFull = false;
    this.totalPushedCount = 0;
  }
}
