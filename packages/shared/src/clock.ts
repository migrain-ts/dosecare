export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private t: number;
  constructor(start: Date) {
    this.t = start.getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  advanceMs(ms: number): void {
    this.t += ms;
  }
  advanceMinutes(m: number): void {
    this.t += m * 60_000;
  }
  set(d: Date): void {
    this.t = d.getTime();
  }
}
