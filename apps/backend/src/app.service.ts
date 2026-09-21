import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unknown';
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async getHealth(): Promise<HealthStatus> {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();

    const overallStatus: 'ok' | 'degraded' | 'unhealthy' =
      dbStatus === 'healthy' ? 'ok' : 'degraded';

    const health: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '1.0.0',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };

    if (health.status !== 'ok') {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }

  async getReadiness(): Promise<{ ready: boolean }> {
    const dbStatus = await this.checkDatabase();
    if (dbStatus !== 'healthy') {
      throw new ServiceUnavailableException({ ready: false, reason: 'database_unhealthy' });
    }
    return { ready: true };
  }

  private async checkDatabase(): Promise<'healthy' | 'unhealthy'> {
    try {
      // readyState: 1 = connected
      if (this.connection.readyState !== 1) {
        return 'unhealthy';
      }
      // Ping the database
      await this.connection.db?.admin().ping();
      return 'healthy';
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return 'unhealthy';
    }
  }

  private async checkRedis(): Promise<'healthy' | 'unknown'> {
    // Redis connection is managed separately; report 'unknown' if we can't check it.
    // In a full implementation, inject the Redis client and run PING.
    return 'unknown';
  }
}
