import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Swagger decorator that wraps a DTO type in the standard paginated
 * response envelope:
 *
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "items": [...],
 *     "total": 100,
 *     "page": 1,
 *     "limit": 20,
 *     "totalPages": 5,
 *     "hasNextPage": true,
 *     "hasPrevPage": false
 *   },
 *   "timestamp": "2026-09-07T…",
 *   "requestId": "…"
 * }
 * ```
 *
 * @param dto - The DTO class that represents a single item in the `items` array.
 *
 * @example
 * \@ApiPaginatedResponse(AuditLogDto)
 * \@Get()
 * findAll() { … }
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(dto: TModel) =>
  applyDecorators(
    ApiExtraModels(dto),
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              success: { type: 'boolean', example: true },
              timestamp: {
                type: 'string',
                format: 'date-time',
                example: '2026-09-07T21:00:00.000Z',
              },
              requestId: {
                type: 'string',
                format: 'uuid',
                example: '550e8400-e29b-41d4-a716-446655440000',
              },
              data: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: getSchemaPath(dto) },
                  },
                  total: { type: 'number', example: 100 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 20 },
                  totalPages: { type: 'number', example: 5 },
                  hasNextPage: { type: 'boolean', example: true },
                  hasPrevPage: { type: 'boolean', example: false },
                },
              },
            },
          },
        ],
      },
    }),
  );
