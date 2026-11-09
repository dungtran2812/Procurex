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
