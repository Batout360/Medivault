"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MFS100_FORMAT_LABELS = exports.MFS100TemplateFormat = exports.DEFAULT_MFS100_TEMPLATE_FORMAT = exports.DEFAULT_MFS100_MATCH_THRESHOLD = exports.verifyBridgeSignature = exports.signBridgePayload = exports.isEncryptedPayload = exports.encryptPayload = exports.deriveKey = exports.decryptPayload = exports.constantTimeEqual = exports.ENCRYPTED_PAYLOAD_PREFIX = exports.findMfs100Dll = exports.MFS100ErrorCode = exports.errorMessage = exports.MFS100SdkError = exports.MFS100Sdk = void 0;
/**
 * @medivault/mfs100-sdk
 *
 * Native wrapper around the Mantra Softech MFS100.dll fingerprint SDK.
 * Used by the biometric bridge (capture + template extraction) and the
 * backend matcher provider (1:1 / 1:N template comparison).
 *
 * SECURITY:
 *  - raw fingerprint images are memory-only and are zeroed immediately
 *  - only ISO/ANSI minutiae templates (never images) cross application APIs
 *  - nothing in this package logs fingerprint payloads
 */
var sdk_1 = require("./sdk");
Object.defineProperty(exports, "MFS100Sdk", { enumerable: true, get: function () { return sdk_1.MFS100Sdk; } });
Object.defineProperty(exports, "MFS100SdkError", { enumerable: true, get: function () { return sdk_1.MFS100SdkError; } });
Object.defineProperty(exports, "errorMessage", { enumerable: true, get: function () { return sdk_1.errorMessage; } });
Object.defineProperty(exports, "MFS100ErrorCode", { enumerable: true, get: function () { return sdk_1.MFS100ErrorCode; } });
var native_sdk_1 = require("./native-sdk");
Object.defineProperty(exports, "findMfs100Dll", { enumerable: true, get: function () { return native_sdk_1.findMfs100Dll; } });
var payload_1 = require("./payload");
Object.defineProperty(exports, "ENCRYPTED_PAYLOAD_PREFIX", { enumerable: true, get: function () { return payload_1.ENCRYPTED_PAYLOAD_PREFIX; } });
Object.defineProperty(exports, "constantTimeEqual", { enumerable: true, get: function () { return payload_1.constantTimeEqual; } });
Object.defineProperty(exports, "decryptPayload", { enumerable: true, get: function () { return payload_1.decryptPayload; } });
Object.defineProperty(exports, "deriveKey", { enumerable: true, get: function () { return payload_1.deriveKey; } });
Object.defineProperty(exports, "encryptPayload", { enumerable: true, get: function () { return payload_1.encryptPayload; } });
Object.defineProperty(exports, "isEncryptedPayload", { enumerable: true, get: function () { return payload_1.isEncryptedPayload; } });
Object.defineProperty(exports, "signBridgePayload", { enumerable: true, get: function () { return payload_1.signBridgePayload; } });
Object.defineProperty(exports, "verifyBridgeSignature", { enumerable: true, get: function () { return payload_1.verifyBridgeSignature; } });
var types_1 = require("./types");
Object.defineProperty(exports, "DEFAULT_MFS100_MATCH_THRESHOLD", { enumerable: true, get: function () { return types_1.DEFAULT_MFS100_MATCH_THRESHOLD; } });
Object.defineProperty(exports, "DEFAULT_MFS100_TEMPLATE_FORMAT", { enumerable: true, get: function () { return types_1.DEFAULT_MFS100_TEMPLATE_FORMAT; } });
Object.defineProperty(exports, "MFS100TemplateFormat", { enumerable: true, get: function () { return types_1.MFS100TemplateFormat; } });
/** Template format identifier strings understood end-to-end by Medivault. */
exports.MFS100_FORMAT_LABELS = {
    0: 'ANSI_378',
    1: 'ISO_19794_2',
    2: 'ISO_19794_2_2007',
    3: 'FUTRONIC_16',
    4: 'FUTRONIC_32',
};
//# sourceMappingURL=index.js.map