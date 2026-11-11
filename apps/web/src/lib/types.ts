/**
 * Kiểu dữ liệu khớp response của API (apps/api). Viết tay cho gọn;
 * bước tiếp theo nên sinh tự động từ Swagger (/docs-json) bằng openapi-typescript.
 */
export type Role = 'ADMIN' | 'APPROVER' | 'BUYER';

export interface Me {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  role: Role;
  approvalLimit: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  path: string;
  depth: number;
}

export type Specs = Record<string, string | number>;

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  categorySlug: string;
  unit: string;
  specs: Specs;
  fromPrice: number | null;
}

export interface SearchResult {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categorySlug: string;
  unit: string;
  specs: Specs;
  minOrderQty: number;
  tiers: Array<{ minQty: number; unitPrice: number }>;
}

export interface Quote {
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  source: 'TIER' | 'CONTRACT';
}

export type PrStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type PrAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL';

export interface PurchaseRequest {
  id: string;
  requesterId: string;
  title: string;
  note: string | null;
  status: PrStatus;
  totalAmount: number;
  version: number;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  lines: Array<{
    lineNo: number;
    productId: string;
    sku: string;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    priceSource: 'TIER' | 'CONTRACT';
    lineTotal: number;
  }>;
  steps: Array<{
    level: number;
    minApproverLimit: number;
    decision: 'PENDING' | 'APPROVED' | 'REJECTED';
    decidedBy: string | null;
    comment: string | null;
    decidedAt: string | null;
  }>;
  allowedActions: PrAction[];
}

export interface PrSummary {
  id: string;
  title: string;
  status: PrStatus;
  totalAmount: number;
  requesterId: string;
  lineCount: number;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalRule {
  level: number;
  minTotal: number;
  minApproverLimit: number;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  taxCode: string | null;
  isActive: boolean;
}

export type RfqStatus = 'OPEN' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

export interface RfqLine {
  lineNo: number;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
}

export interface Rfq {
  id: string;
  prId: string;
  createdBy: string;
  status: RfqStatus;
  deadline: string;
  lines: RfqLine[];
  closedAt: string | null;
  createdAt: string;
}

export interface QuoteSummary {
  quoteId: string;
  invitationId: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  leadTimeDays: number;
  validUntil: string;
  submittedAt: string;
  lines: Array<{ lineNo: number; unitPrice: number; lineTotal: number }>;
}

export interface RfqDetail extends Rfq {
  invitations: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    supplierEmail: string;
    sentAt: string | null;
    respondedAt: string | null;
  }>;
  quotes: QuoteSummary[];
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  rfqId: string;
  prId: string;
  supplierName: string;
  totalAmount: number;
  lines: Array<RfqLine & { unitPrice: number; lineTotal: number }>;
  status: 'ISSUED' | 'CANCELLED';
  erpSyncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  erpRef: string | null;
  erpAttempts: number;
  erpLastError: string | null;
  createdAt: string;
}

export interface SupplierPortalView {
  supplierName: string;
  rfq: {
    id: string;
    status: RfqStatus;
    deadline: string;
    lines: RfqLine[];
    acceptingQuotes: boolean;
  };
  myQuote: QuoteSummary | null;
}
