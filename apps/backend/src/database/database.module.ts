import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('DATABASE_URL'),
        // Connection pool — 10 is a safe default for a single-process API server
        maxPoolSize: 10,
        minPoolSize: 2,
        // How long a socket can be idle before being closed
        socketTimeoutMS: 45_000,
        // How long to wait for an initial connection before throwing
        connectTimeoutMS: 10_000,
        // How long the driver will keep trying to find a reachable server
        serverSelectionTimeoutMS: 10_000,
        // Retry writes on network errors (safe for all idempotent write ops)
        retryWrites: true,
        // Keep the connection alive with periodic pings
        heartbeatFrequencyMS: 10_000,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
