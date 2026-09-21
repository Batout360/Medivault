import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptPayload, isEncryptedPayload, verifyBridgeSignature } from '@medivault/mfs100-sdk';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { BiometricCaptureData } from '../providers/biometric-provider.interface';

/**
 * Max age (ms) of a capture signature before it is rejected (anti-replay).
 */
export const CAPTURE_FRESHNESS_MS = 90_000;

export interface VerifiedCapture {
  /** Decrypted minutiae template as base64 — the only thing that exists. */
  templatePayload: string;
  format: string;
  quality: number;
  deviceId: string;
  capturedAt: string;
  fromBridge: boolean;
}

interface SecurityContext {
  userId?: string;
  organizationId?: string;
  ipAddress: string;
  userAgent: string;
  requestId?: string;
}

/**
 * Validates that a captured biometric payload genuinely came through the local
 * biometric bridge (HMAC signature), that it is fresh (anti-replay), and that
 * the template relayed through the browser is opaque ciphertext only — it is
 * decrypted here, server-side, and never exposed again.
 */
@Injectable()
export class BiometricSecurityService {
  private readonly logger = new Logger(BiometricSecurityService.name);
  private readonly bridgeSecret: string;
  private readonly allowedDeviceIds: string[];

  constructor(
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {
    this.bridgeSecret = config.get<string>('BIOMETRIC_BRIDGE_SECRET', '') ?? '';
    this.allowedDeviceIds = (config.get<string>('BIOMETRIC_ALLOWED_DEVICES', '') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Verify and decrypt a capture before it reaches the matcher.
   *
   * Rules:
   *  - Encrypted (MV1:) payloads REQUIRE a valid bridge HMAC + a fresh
   *    capturedAt; otherwise the request is rejected and audited.
   *  - Plain payloads are allowed only when the bridge payloads are NOT
   *    encrypted (dev mode). Declaring them in production is blocked.
   */
  async verifyAndDecrypt(
    capture: BiometricCaptureData,
    ctx: SecurityContext,
  ): Promise<VerifiedCapture> {
    const encrypted = isEncryptedPayload(capture.templatePayload);

    if (encrypted) {
      const signatureOk = this.verifySignature(capture);
      const freshnessOk = this.isFresh(capture.capturedAt);
      const deviceOk = this.isDeviceAllowed(capture.deviceId);

      if (!signatureOk || !freshnessOk || !deviceOk) {
        const reason = !signatureOk
          ? 'Invalid bridge signature'
          : !freshnessOk
            ? 'Capture is expired (anti-replay)'
            : 'Device is not in the allowed list';
        await this.auditFailure(encrypted, reason, capture, ctx);
        throw new UnauthorizedException('Biometric capture failed security verification.');
      }

      try {
        return {
          templatePayload: decryptPayload(
            capture.templatePayload,
            this.config.get<string>('BIOMETRIC_ENCRYPTION_KEY') ?? '',
          ),
          format: capture.format,
          quality: capture.quality,
          deviceId: capture.deviceId,
          capturedAt: capture.capturedAt,
          fromBridge: true,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Payload decryption failed';
        await this.auditFailure(encrypted, reason, capture, ctx);
        throw new UnauthorizedException('Biometric payload could not be decrypted.');
      }
    }

    // Plain (unencrypted) payload — permitted only in development.
    if (process.env.NODE_ENV === 'production') {
      await this.auditFailure(
        false,
        'Plain biometric payload rejected in production (bridge encryption missing)',
        capture,
        ctx,
      );
      throw new UnauthorizedException('Biometric capture is missing required encryption.');
    }

    return {
      templatePayload: capture.templatePayload,
      format: capture.format,
      quality: capture.quality,
      deviceId: capture.deviceId,
      capturedAt: capture.capturedAt,
      fromBridge: false,
    };
  }

  private verifySignature(capture: BiometricCaptureData): boolean {
    if (!this.bridgeSecret || !capture.bridgeSignature) return false;
    return verifyBridgeSignature(
      {
        opaquePayload: capture.templatePayload,
        format: capture.format,
        deviceId: capture.deviceId,
        capturedAt: capture.capturedAt,
      },
      capture.bridgeSignature,
      this.bridgeSecret,
    );
  }

  private isFresh(capturedAt: string): boolean {
    const time = Date.parse(capturedAt);
    if (Number.isNaN(time)) return false;
    return Math.abs(Date.now() - time) <= CAPTURE_FRESHNESS_MS;
  }

  private isDeviceAllowed(deviceId: string): boolean {
    return this.allowedDeviceIds.length === 0 || this.allowedDeviceIds.includes(deviceId);
  }

  private async auditFailure(
    encrypted: boolean,
    reason: string,
    capture: BiometricCaptureData,
    ctx: SecurityContext,
  ): Promise<void> {
    this.logger.warn(
      `Biometric capture rejected: ${reason} (device=${capture.deviceId}, encrypted=${encrypted})`,
    );
    await this.auditLogs.log({
      eventType: 'BIOMETRIC_SECURITY_FAILURE',
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      action: 'VERIFY_CAPTURE',
      result: 'failure',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { reason, deviceId: capture.deviceId, encrypted },
    });
  }
}
