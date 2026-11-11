export interface OutgoingNotification {
  companyId?: string | null;
  /** Email hoặc định danh nội bộ (vd 'user:<id>', 'approvers:<companyId>'). */
  recipient: string;
  subject: string;
  body: string;
  /** Cùng dedupeKey chỉ gửi 1 lần — job chạy lại không gửi email trùng. */
  dedupeKey: string;
}

/** PORT gửi thông báo. Hiện tại: ghi vào bảng notifications (hộp thư mock). */
export abstract class Notifier {
  abstract send(n: OutgoingNotification): Promise<void>;
}
