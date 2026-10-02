import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DEFAULT_MSO_MATCH_THRESHOLD, MSOSdk, MSOSdkError } from '@medivault/mso-sdk';
import {
  BiometricCaptureData,
  BiometricEnrollResult,
  BiometricMatchResult,
  BiometricProvider,
  BiometricTemplateGalleryItem,
} from './biometric-provider.interface';

/** Normalise a raw SDK match score (0–100000) to a 0–100 percentage. */
function normalizeScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round((score / 100000) * 1000) / 10));
}

/**
 * MSO1300BiometricProvider — Idemia MSO 1300 E3 matcher powered by the vendor SDK.
 *
 * The biometric bridge on the workstation captures the fingerprint and extracts
 * an ISO 19794-2 minutiae template; this provider performs 1:1 / 1:N
 * *mathematical* comparisons using MorphoSmartCST.dll (MINEX-compliant matching)
 * inside the trusted backend process.
 *
 * Requires MorphoSmartCST.dll (Idemia MSO SDK) plus a valid license key, and
 * BIOMETRIC_PROVIDER=mso1300.
 *
 * @see https://www.idemia.com/fingerprint-authentication/ — MSO 1300 Series
 */
@Injectable()
export class MSO1300BiometricProvider implements BiometricProvider {
  private readonly logger = new Logger(MSO1300BiometricProvider.name);
  private readonly sdk: MSOSdk;
  private readonly matchThreshold: number;

  constructor() {
    this.sdk = MSOSdk.getInstance();
    const configured = parseInt(process.env.MSO_MATCH_THRESHOLD ?? '', 10);
    this.matchThreshold = Number.isNaN(configured) ? DEFAULT_MSO_MATCH_THRESHOLD : configured;
  }

  private requireSdk(): void {
    const status = this.sdk.getStatus();
    if (status.failureCode) {
      throw new ServiceUnavailableException(
        `Idemia MSO SDK unavailable (${status.failureCode}). ` +
          'Install MorphoSmartCST.dll on the server and set MSO_SDK_DLL.',
      );
    }
  }

  private prepareSdk(): void {
    this.requireSdk();
    if (!this.sdk.isDeviceConnected()) {
      // Backend-side matching does not require a physical scanner attached to
      // the server, but the SDK must still be initialized to load the native
      // runtime and expose the matching functions.
      this.sdk.initialize().catch(() => undefined);
    }
  }

  async enroll(
    patientId: string,
    captureData: BiometricCaptureData,
  ): Promise<BiometricEnrollResult> {
    this.logger.debug(`[MSO1300] Enrolling template for patient ${patientId}`);

    if (!captureData.templatePayload || captureData.templatePayload.length < 20) {
      return {
        success: false,
        templateId: '',
        quality: 0,
        message: 'Template payload is missing or too small.',
      };
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(captureData.templatePayload, 'base64');
    } catch {
      return {
        success: false,
        templateId: '',
        quality: 0,
        message: 'Template payload is not valid base64.',
      };
    }

    if (bytes.length < 4 || bytes.length > 65536) {
      return {
        success: false,
        templateId: '',
        quality: 0,
        message: 'Template payload size is outside the supported range.',
      };
    }

    return {
      success: true,
      templateId: `${patientId}:${captureData.deviceId || 'unknown'}`,
      quality: captureData.quality,
      message: 'Enrolled via Idemia MSO 1300 E3.',
    };
  }

  async identify(
    captureData: BiometricCaptureData,
    gallery: BiometricTemplateGalleryItem[] = [],
  ): Promise<BiometricMatchResult> {
    this.prepareSdk();
    if (!gallery.length) return { matched: false };

    let probe: Buffer;
    try {
      probe = Buffer.from(captureData.templatePayload, 'base64');
    } catch {
      return { matched: false };
    }

    let best: (BiometricMatchResult & { score: number }) | null = null;

    for (const item of gallery) {
      try {
        const { matched, score } = await this.sdk.matchTemplates(
          probe,
          Buffer.from(item.templatePayload, 'base64'),
          this.matchThreshold,
        );
        if (matched && score >= this.matchThreshold && (!best || score > best.score)) {
          best = {
            matched: true,
            score,
            templateId: item.templateId,
            patientId: item.patientId,
          };
        }
      } catch (err) {
        this.logger.debug(
          `[MSO1300] Skipping gallery template ${item.templateId}: ${(err as Error).message}`,
        );
      }
    }

    if (best) {
      return { ...best, score: normalizeScore(best.score) };
    }
    return { matched: false };
  }

  async verify(
    patientId: string,
    captureData: BiometricCaptureData,
    templates: BiometricTemplateGalleryItem[] = [],
  ): Promise<BiometricMatchResult> {
    this.prepareSdk();

    const patientTemplates = templates.filter((t) => t.patientId === patientId);
    if (!patientTemplates.length) return { matched: false };

    let probe: Buffer;
    try {
      probe = Buffer.from(captureData.templatePayload, 'base64');
    } catch {
      return { matched: false };
    }

    for (const item of patientTemplates) {
      try {
        const { matched, score } = await this.sdk.matchTemplates(
          probe,
          Buffer.from(item.templatePayload, 'base64'),
          this.matchThreshold,
        );
        if (matched && score >= this.matchThreshold) {
          return {
            matched: true,
            score: normalizeScore(score),
            templateId: item.templateId,
            patientId,
          };
        }
      } catch (err) {
        this.logger.debug(
          `[MSO1300] Skipping template ${item.templateId}: ${(err as Error).message}`,
        );
      }
    }

    return { matched: false };
  }

  async deleteTemplates(patientId: string): Promise<void> {
    // Template storage deletion is handled by BiometricService (MongoDB).
    this.logger.debug(`[MSO1300] Templates marked for deletion: patient=${patientId}`);
  }

  async healthCheck(): Promise<boolean> {
    const status = this.sdk.getStatus();
    if (status.failureCode) {
      this.logger.warn(`[MSO1300] SDK unavailable: failureCode=${status.failureCode}`);
      return false;
    }
    try {
      await this.sdk.initialize();
      return true;
    } catch (err) {
      if (err instanceof MSOSdkError) {
        this.logger.warn(`[MSO1300] healthCheck failed: ${err.message}`);
      }
      return false;
    }
  }
}
