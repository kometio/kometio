// What to say of something that was thrown. Anything can be: a string, or a
// `null` that a callback was given in place of an error. `.message` of those is
// `undefined` in the log, or a second error where the first was being reported.

/** The message of an error, or the thing itself as text. @param {unknown} error */
export const messageOf = (error) =>
  error instanceof Error ? error.message : String(error);
