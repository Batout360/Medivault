import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  requestId: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        // StreamableFile responses (e.g. /documents/download/:token) must reach
        // the response pipeline untouched — wrapping them in { success, data }
        // makes Nest JSON-serialize the stream instead of streaming the bytes.
        if (data instanceof StreamableFile) return data as any;
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
          requestId: request.requestId || 'unknown',
        };
      }),
    );
  }
}
