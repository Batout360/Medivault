import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService, HealthStatus } from './app.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check endpoint — used by load balancers and monitoring tools.
   * No authentication required.
   */
  @Get('health')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns the health status of the API and its dependencies.',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string', example: '1.0.0' },
        uptime: { type: 'number', description: 'Uptime in seconds' },
        environment: { type: 'string', example: 'production' },
        services: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'healthy' },
            redis: { type: 'string', example: 'healthy' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'API or dependencies are unhealthy' })
  async getHealth(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }

  /**
   * Readiness probe — used by Kubernetes to determine if the pod can accept traffic.
   */
  @Get('ready')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Returns 200 if the application is ready to serve requests.',
  })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async getReadiness(): Promise<{ ready: boolean }> {
    return this.appService.getReadiness();
  }

  /**
   * Liveness probe — used by Kubernetes to determine if the pod needs restarting.
   */
  @Get('alive')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  getAlive(): { alive: boolean; timestamp: string } {
    return { alive: true, timestamp: new Date().toISOString() };
  }
}
