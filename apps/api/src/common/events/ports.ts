/**
 * PORT cho xử lý bất đồng bộ. Module nghiệp vụ chỉ biết các abstract class này;
 * hiện thực BullMQ ở src/infrastructure/queue.
 */

export interface EventContext {
  eventId: string;
  type: string;
}

export type EventHandler = (payload: Record<string, unknown>, ctx: EventContext) => Promise<void>;

/**
 * Đăng ký handler cho domain event (đến từ outbox).
 * Mỗi (eventId, handlerName) chạy THÀNH CÔNG đúng 1 lần (idempotent consumer):
 * job có thể giao lại (retry, worker chết giữa chừng) nhưng handler đã xong sẽ được bỏ qua.
 */
export abstract class EventBus {
  abstract on(type: string, handlerName: string, handler: EventHandler): void;
}

export interface JobOptions {
  /** Id cố định → thêm trùng sẽ bị bỏ qua (dedupe). Không dùng ký tự ':' (BullMQ cấm). */
  jobId?: string;
  /** Chạy sau bao nhiêu ms (timer/SLA). */
  delayMs?: number;
  attempts?: number;
  /** Backoff mũ: lần n chờ backoffMs * 2^(n-1) (+ jitter của BullMQ). */
  backoffMs?: number;
}

export type JobHandler = (
  data: Record<string, unknown>,
  meta: { attemptsMade: number; final: boolean },
) => Promise<void>;

/** Hàng đợi việc chung: đăng ký handler theo tên queue, thêm job (có thể hẹn giờ). */
export abstract class JobQueue {
  abstract process(queue: string, handler: JobHandler, opts?: { concurrency?: number }): void;
  abstract add(
    queue: string,
    name: string,
    data: Record<string, unknown>,
    opts?: JobOptions,
  ): Promise<void>;
  abstract remove(queue: string, jobId: string): Promise<void>;
}
