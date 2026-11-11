import type { AuthUser } from '../../../../common/auth/auth.types';
import type {
  ApprovalRule,
  Approver,
  PrStatus,
  PurchaseRequest,
} from '../../domain/purchase-request';

/**
 * ANTI-CORRUPTION LAYER: procurement nói chuyện với catalog/identity qua các port do CHÍNH NÓ
 * định nghĩa. Adapter (infrastructure/) gọi use case của module kia. Giai đoạn 4 tách service →
 * chỉ đổi adapter sang HTTP/gRPC, use case procurement không đổi.
 */
export interface PricedItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  priceSource: 'TIER' | 'CONTRACT';
  lineTotal: number;
}

export abstract class PricingPort {
  /** Báo giá theo công ty của người mua (giá hợp đồng nếu có). */
  abstract price(buyer: AuthUser, productId: string, quantity: number): Promise<PricedItem>;
}

export abstract class ApproverDirectory {
  /** Thông tin quyền duyệt hiện tại của user (approvalLimit, isActive) — đọc mới, không tin JWT. */
  abstract get(actor: AuthUser): Promise<Approver>;
}

export interface NewPurchaseRequest {
  companyId: string;
  requesterId: string;
  title: string;
  note: string | null;
  totalAmount: number;
  lines: PurchaseRequest['lines'];
}

export interface PrListFilter {
  companyId: string;
  requesterId?: string; // BUYER chỉ thấy PR của mình
  status?: PrStatus;
  page: number;
  pageSize: number;
}

export interface PrSummary {
  id: string;
  title: string;
  status: PrStatus;
  totalAmount: number;
  requesterId: string;
  lineCount: number;
  createdAt: Date;
}

export abstract class PurchaseRequestRepository {
  abstract create(input: NewPurchaseRequest): Promise<PurchaseRequest>;
  /** Luôn lọc theo companyId: PR công ty khác coi như không tồn tại (404, không phải 403). */
  abstract findById(companyId: string, id: string): Promise<PurchaseRequest | null>;
  abstract list(filter: PrListFilter): Promise<{ items: PrSummary[]; total: number }>;
  /**
   * Lưu trạng thái + các bước duyệt với OPTIMISTIC LOCKING:
   * chỉ ghi nếu DB vẫn đang ở `pr.version`; ghi xong version + 1.
   * Lệch version → DomainError('CONCURRENT_MODIFICATION').
   */
  abstract save(pr: PurchaseRequest): Promise<PurchaseRequest>;
}

export abstract class ApprovalRuleRepository {
  abstract list(companyId: string): Promise<ApprovalRule[]>;
  abstract replace(companyId: string, rules: ApprovalRule[]): Promise<void>;
}
