"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MFS100SdkError = exports.DEFAULT_MFS100_MATCH_THRESHOLD = exports.DEFAULT_MFS100_TEMPLATE_FORMAT = exports.MFS100TemplateFormat = void 0;
/** Template formats supported by the MFS100 SDK. */
var MFS100TemplateFormat;
(function (MFS100TemplateFormat) {
    MFS100TemplateFormat[MFS100TemplateFormat["ANSI378"] = 0] = "ANSI378";
    MFS100TemplateFormat[MFS100TemplateFormat["ISO19794_2"] = 1] = "ISO19794_2";
    MFS100TemplateFormat[MFS100TemplateFormat["ISO19794_2_2007"] = 2] = "ISO19794_2_2007";
    MFS100TemplateFormat[MFS100TemplateFormat["FUTRONIC_16"] = 3] = "FUTRONIC_16";
    MFS100TemplateFormat[MFS100TemplateFormat["FUTRONIC_32"] = 4] = "FUTRONIC_32";
})(MFS100TemplateFormat || (exports.MFS100TemplateFormat = MFS100TemplateFormat = {}));
exports.DEFAULT_MFS100_TEMPLATE_FORMAT = MFS100TemplateFormat.ISO19794_2;
/**
 * Minutiae matching threshold used by MFS100_MatchTemplate.
 * The SDK reports a score between 0 and 100000; per Mantra documentation a
 * score of >= 14000 is considered a match.
 */
exports.DEFAULT_MFS100_MATCH_THRESHOLD = 14000;
/** Error thrown by the SDK wrapper with a stable machine-readable code. */
class MFS100SdkError extends Error {
    code;
    sdkCode;
    constructor(code, message, sdkCode = code) {
        super(message ?? `MFS100 SDK error ${code}`);
        this.name = 'MFS100SdkError';
        this.code = code;
        this.sdkCode = sdkCode;
    }
}
exports.MFS100SdkError = MFS100SdkError;
//# sourceMappingURL=types.js.map