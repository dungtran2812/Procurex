import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, DomainErrorCode } from './domain-error';

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  TAX_CODE_TAKEN: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  INVALID_REFRESH_TOKEN: HttpStatus.UNAUTHORIZED,
  USER_INACTIVE: HttpStatus.FORBIDDEN,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  BELOW_MIN_ORDER_QTY: HttpStatus.UNPROCESSABLE_ENTITY,
  PRICE_NOT_AVAILABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,
  PR_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_TRANSITION: HttpStatus.CONFLICT,
  FORBIDDEN_ACTION: HttpStatus.FORBIDDEN,
  CONCURRENT_MODIFICATION: HttpStatus.CONFLICT,
  EMPTY_PR: HttpStatus.UNPROCESSABLE_ENTITY,
  COMMENT_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_APPROVAL_RULES: HttpStatus.UNPROCESSABLE_ENTITY,
  SUPPLIER_NOT_FOUND: HttpStatus.NOT_FOUND,
  SUPPLIER_EXISTS: HttpStatus.CONFLICT,
  RFQ_NOT_FOUND: HttpStatus.NOT_FOUND,
  RFQ_EXISTS: HttpStatus.CONFLICT,
  INVALID_RFQ: HttpStatus.UNPROCESSABLE_ENTITY,
  RFQ_CLOSED: HttpStatus.CONFLICT,
  INVALID_QUOTE: HttpStatus.UNPROCESSABLE_ENTITY,
  // Token sai/không tồn tại → 404 (không tiết lộ RFQ có tồn tại hay không).
  INVALID_INVITE_TOKEN: HttpStatus.NOT_FOUND,
  PO_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const status = STATUS_BY_CODE[error.code] ?? HttpStatus.BAD_REQUEST;

    res.status(status).json({
      statusCode: status,
      error: error.code,
      message: error.message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
