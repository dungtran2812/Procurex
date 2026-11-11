/** PORT thời gian: để use case không gọi new Date() trực tiếp → test cố định được thời điểm. */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
