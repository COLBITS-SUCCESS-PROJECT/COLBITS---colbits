/** Access tokens expire after 15 minutes unless JWT_EXPIRES_IN says otherwise (NF-06). */
export const JWT_EXPIRES_IN_DEFAULT = '15m';

/** Same message for unknown user, wrong password and inactive account: never reveal which one failed. */
export const INVALID_CREDENTIALS = 'Invalid credentials';
