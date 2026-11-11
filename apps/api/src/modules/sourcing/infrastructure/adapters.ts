import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth/auth.types';
import { ENV, Env } from '../../../config/env';
import { PurchaseRequestService } from '../../procurement/application/use-cases/purchase-request.use-cases';
import { ErpPort, PurchaseOrder, PurchaseRequestReader } from '../application/ports';

/** Đọc PR qua use case public của procurement (giữ ranh giới module). */
@Injectable()
export class ProcurementPrReader extends PurchaseRequestReader {
  constructor(private readonly prs: PurchaseRequestService) {
    super();
  }

  async get(actor: AuthUser, prId: string) {
    const pr = await this.prs.get(actor, prId);
    return {
      status: pr.status,
      totalAmount: pr.totalAmount,
      lines: pr.lines.map((l) => ({
        lineNo: l.lineNo,
        sku: l.sku,
        productName: l.productName,
        unit: l.unit,
        quantity: l.quantity,
      })),
    };
  }
}

/**
 * ERP giả lập. Hành vi giống ERP thật cần có:
 *  - Lỗi tạm thời ngẫu nhiên (ERP_MOCK_FAILURE_RATE) để thấy retry/backoff.
 *  - IDEMPOTENT theo poNumber: gửi lại cùng PO trả lại đúng erpRef cũ, không tạo đơn trùng.
 * Thay bằng adapter SAP/Odoo/MISA thật mà không sửa use case.
 */
@Injectable()
export class MockErpAdapter extends ErpPort {
  private readonly created = new Map<string, string>();

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async pushPurchaseOrder(po: PurchaseOrder): Promise<{ erpRef: string }> {
    await new Promise((r) => setTimeout(r, 50)); // độ trễ mạng
    const existing = this.created.get(po.poNumber);
    if (existing) return { erpRef: existing };
    if (Math.random() < this.env.ERP_MOCK_FAILURE_RATE) {
      throw new Error('ERP tạm thời không phản hồi (503)');
    }
    const erpRef = `ERP-${po.poNumber.slice(-6)}-${this.created.size + 1}`;
    this.created.set(po.poNumber, erpRef);
    return { erpRef };
  }
}
