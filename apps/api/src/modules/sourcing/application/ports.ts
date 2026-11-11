import type { AuthUser } from '../../../common/auth/auth.types';
import type { QuoteLine, QuoteSummary, Rfq, RfqLine, RfqStatus } from '../domain/sourcing';

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  email: string;
  taxCode: string | null;
  isActive: boolean;
}

export interface Invitation {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string;
  sentAt: Date | null;
  respondedAt: Date | null;
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  poNumber: string;
  rfqId: string;
  prId: string;
  supplierId: string;
  supplierName: string;
  quoteId: string;
  totalAmount: number;
  lines: Array<RfqLine & QuoteLine>;
  status: 'ISSUED' | 'CANCELLED';
  erpSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  erpRef: string | null;
  erpAttempts: number;
  erpLastError: string | null;
  issuedBy: string;
  createdAt: Date;
}

export type NewPurchaseOrder = Omit<
  PurchaseOrder,
  'id' | 'status' | 'erpSyncStatus' | 'erpRef' | 'erpAttempts' | 'erpLastError' | 'createdAt'
>;

export abstract class SourcingRepository {
  // Suppliers
  abstract createSupplier(s: Omit<Supplier, 'id' | 'isActive'>): Promise<Supplier>;
  abstract listSuppliers(companyId: string): Promise<Supplier[]>;
  abstract findSuppliers(companyId: string, ids: string[]): Promise<Supplier[]>;

  // RFQ
  abstract createRfq(
    rfq: Omit<Rfq, 'id' | 'status' | 'version' | 'closedAt' | 'createdAt'>,
    supplierIds: string[],
  ): Promise<Rfq>;
  abstract findRfq(companyId: string, id: string): Promise<Rfq | null>;
  abstract listRfqs(companyId: string, status?: RfqStatus): Promise<Rfq[]>;
  /** Optimistic locking như PR: lệch version → CONCURRENT_MODIFICATION. */
  abstract saveRfq(rfq: Rfq): Promise<Rfq>;
  abstract listInvitations(rfqId: string): Promise<Invitation[]>;

  // Lời mời & báo giá (phía NCC, xác thực bằng token)
  abstract setInvitationToken(invitationId: string, tokenHash: string, sentAt: Date): Promise<void>;
  abstract findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<(Invitation & { rfq: Rfq; companyId: string }) | null>;
  abstract upsertQuote(
    invitationId: string,
    q: {
      totalAmount: number;
      leadTimeDays: number;
      validUntil: Date;
      note: string | null;
      lines: QuoteLine[];
    },
    at: Date,
  ): Promise<void>;
  abstract listQuotes(rfqId: string): Promise<Array<QuoteSummary & { lines: QuoteLine[] }>>;

  // PO
  abstract createPo(po: NewPurchaseOrder): Promise<PurchaseOrder>;
  abstract findPo(companyId: string, id: string): Promise<PurchaseOrder | null>;
  abstract listPos(companyId: string): Promise<PurchaseOrder[]>;
  abstract updateErpSync(
    id: string,
    patch: Pick<PurchaseOrder, 'erpSyncStatus'> &
      Partial<Pick<PurchaseOrder, 'erpRef' | 'erpLastError'>> & { incrementAttempts?: boolean },
  ): Promise<void>;
}

/** Đọc PR đã duyệt (adapter gọi PurchaseRequestService của module procurement). */
export abstract class PurchaseRequestReader {
  abstract get(
    actor: AuthUser,
    prId: string,
  ): Promise<{ status: string; lines: RfqLine[]; totalAmount: number }>;
}

/** ERP của khách hàng (SAP/Odoo/MISA...). Phải idempotent theo poNumber. */
export abstract class ErpPort {
  abstract pushPurchaseOrder(po: PurchaseOrder): Promise<{ erpRef: string }>;
}
