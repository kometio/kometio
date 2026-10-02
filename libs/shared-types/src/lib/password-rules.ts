/**
 * The shortest password the product accepts.
 *
 * One number for the places that must agree on it: the API refuses a
 * shorter one, and the forms that ask for a password say so before sending.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The shortest password the first administrator of a deployment may set.
 *
 * Longer than everybody else's on purpose: it is the one account that can
 * do everything, created while the deployment is reachable before anything
 * else protects it. The API's setup schema and the setup wizard read this
 * one number; it is not `MIN_PASSWORD_LENGTH`, which an invited person,
 * a reset and a password change follow.
 */
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
