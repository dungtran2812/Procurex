import { Injectable, Logger } from '@nestjs/common';
import { Notifier, OutgoingNotification } from '../../common/notifications/ports';
import { PrismaService } from '../prisma/prisma.service';
import { db } from './prisma-unit-of-work';

/**
 * Hộp thư mock: ghi DB (cùng transaction nếu gọi trong uow.run) + log.
 * Production: adapter gửi email (SES/SendGrid) hoặc socket.io, vẫn giữ dedupeKey.
 */
@Injectable()
export class PrismaNotifier extends Notifier {
  private readonly logger = new Logger('Notifier');

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async send(n: OutgoingNotification): Promise<void> {
    // ON CONFLICT DO NOTHING: không ném lỗi (lỗi sẽ làm hỏng cả transaction đang mở).
    const inserted = await db(this.prisma).$executeRaw`
      INSERT INTO notifications (id, company_id, recipient, subject, body, dedupe_key)
      VALUES (gen_random_uuid(), ${n.companyId ?? null}::uuid, ${n.recipient}, ${n.subject},
              ${n.body}, ${n.dedupeKey})
      ON CONFLICT (dedupe_key) DO NOTHING`;
    if (inserted) this.logger.log(`📧 → ${n.recipient}: ${n.subject}`);
  }
}
