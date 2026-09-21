import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DEFAULT_MFS100_MATCH_THRESHOLD, MFS100Sdk, MFS100SdkError } from '@medivault/mfs100-sdk';
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
 * MFS100BiometricProvider — Mantra MFS100 matcher powered by the vendor SDK.
 *
 * The bridge captures and extracts the template on the workstation; this
 * provider performs the 1:1 / 1:N *mathematical* comparison using the SDK
 * (NIST MINEX-style minutiae matching) inside the trusted backend process.
 *
 * Requires the Mantra SDK (MFS100.dll) plus valid license data, and
 * BIOMETRIC_PROVIDER=mfs100.
 */
@Injectable()
export class MFS100BiometricProvider implements BiometricProvider {
  private readonly logger = new Logger(MFS100BiometricProvider.name);
  private readonly sdk: MFS100Sdk;
  private readonly matchThreshold: number;

  constructor() {
    this.sdk = MFS100Sdk.getInstance();
    const configured = parseInt(process.env.MFS100_MATCH_THRESHOLD ?? '', 10);
    this.matchThreshold = Number.isNaN(configured) ? DEFAULT_MFS100_MATCH_THRESHOLD : configured;
  }

  private requireSdk(): void {
    const status = this.sdk.getStatus();
    if (status.failureCode) {
      throw new ServiceUnavailableException(
        `MFS100 SDK unavailable (${status.failureCode}). ` +
          'Install the Mantra SDK / MFS100.dll on the server.',
      );
    }
  }

  private prepareSdk(): void {
    this.requireSdk();
    if (!this.sdk.isDeviceConnected()) {
      // Backend-side matching does not require a physical scanner, but the SDK
      // must still be initialized to load the native runtime.
      this.sdk.initialize().catch(() => undefined);
    }
  }

  async enroll(
    patientId: string,
    captureData: BiometricCaptureData,
  ): Promise<BiometricEnrollResult> {
    this.logger.debug(`[MFS100] Enrolling template for patient ${patientId}`);
    // The bridge already performed SDK template extraction; integrity is
    // verified at the payload layer. Non-empty, base64-safe template required.
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
      message: 'Enrolled via Mantra MFS100 SDK.',
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
          `[MFS100] Skipping gallery template ${item.templateId}: ${(err as Error).message}`,
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
          `[MFS100] Skipping template ${item.templateId}: ${(err as Error).message}`,
        );
      }
    }
    return { matched: false };
  }

  async deleteTemplates(patientId: string): Promise<void> {
    // Storage deletion is handled by BiometricService (MongoDB).
    this.logger.debug(`[MFS100] Templates marked deleted for patient ${patientId}`);
  }

  async healthCheck(): Promise<boolean> {
    const status = this.sdk.getStatus();
    if (status.failureCode) return false;
    try {
      await this.sdk.initialize();
      return true;
    } catch (err) {
      if (err instanceof MFS100SdkError) {
        this.logger.warn(`[MFS100] healthCheck failed: ${err.message}`);
      }
      return false;
    }
  }
}
