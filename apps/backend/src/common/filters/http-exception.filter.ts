import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: false;
  error: { code: string; message: string };
  requestId: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message, code } = this.resolveException(exception);

    this.logger.error(
      `[${request.requestId}] ${request.method} ${request.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const body: ErrorResponse = {
      success: false,
      error: { code, message },
      requestId: request.requestId || 'unknown',
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }

  private resolveException(exception: unknown): { status: number; message: string; code: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message = typeof res === 'string' ? res : (res as any).message || exception.message;
      return {
        status,
        message: Array.isArray(message) ? message.join('; ') : message,
        code: this.statusToCode(status),
      };
    }
    // MySQL duplicate entry (TypeORM surfaces this as a raw error)
    if ((exception as any)?.code === 'ER_DUP_ENTRY') {
      return {
        status: HttpStatus.CONFLICT,
        message: 'A resource with that value already exists.',
        code: 'CONFLICT',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return map[status] || 'ERROR';
  }
}
