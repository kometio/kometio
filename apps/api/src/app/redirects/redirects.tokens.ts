export const REDIRECTS_DEPS = Symbol('REDIRECTS_DEPS');
export const PUBLIC_REDIRECTS_DEPS = Symbol('PUBLIC_REDIRECTS_DEPS');
/** One set of compiled rules per site for the whole process: what a write invalidates and a request reads. */
export const REDIRECT_RULE_SETS = Symbol('REDIRECT_RULE_SETS');
export const REDIRECT_TRAFFIC = Symbol('REDIRECT_TRAFFIC');
