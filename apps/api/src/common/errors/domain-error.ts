/**
 * Lỗi nghiệp vụ. Domain/application CHỈ ném DomainError (thuần TS),
 * không ném HttpException — việc map sang HTTP là của tầng presentation (DomainErrorFilter).
 */
export type DomainErrorCode =
  | 'EMAIL_TAKEN'
  | 'TAX_CODE_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'USER_INACTIVE'
  | 'USER_NOT_FOUND'
  | 'BELOW_MIN_ORDER_QTY'
  | 'PRICE_NOT_AVAILABLE'
  | 'PRODUCT_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'PR_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN_ACTION'
  | 'CONCURRENT_MODIFICATION'
  | 'EMPTY_PR'
  | 'COMMENT_REQUIRED'
  | 'INVALID_APPROVAL_RULES'
  | 'SUPPLIER_NOT_FOUND'
  | 'SUPPLIER_EXISTS'
  | 'RFQ_NOT_FOUND'
  | 'RFQ_EXISTS'
  | 'INVALID_RFQ'
  | 'RFQ_CLOSED'
  | 'INVALID_QUOTE'
  | 'INVALID_INVITE_TOKEN'
  | 'PO_NOT_FOUND';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
