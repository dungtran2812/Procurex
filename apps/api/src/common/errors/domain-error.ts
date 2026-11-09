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
  | 'USER_NOT_FOUND';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
