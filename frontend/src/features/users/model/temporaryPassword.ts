/**
 * Temporary password of a new consultation user, generated in the browser with the Web Crypto API.
 * TEMPORARY: the backend asks for a password on POST /users today. Remove this file once the backend
 * generates it and emails a set-password link (spec Q3, backend task proposed in Sprint 6).
 */

export const TEMPORARY_PASSWORD_LENGTH = 16

/** Letters and digits that cannot be confused when read aloud or copied by hand (no I, l, O, 0, 1). */
const CHARACTER_SETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!@#$%*-_',
] as const

const ALL_CHARACTERS = CHARACTER_SETS.join('')
const UINT32_RANGE = 0x1_0000_0000

/** Uniform integer in [0, max): values above the last full multiple of `max` are drawn again. */
function randomIndex(max: number): number {
  const limit = Math.floor(UINT32_RANGE / max) * max
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] ?? limit
  } while (value >= limit)
  return value % max
}

function randomCharacter(characters: string): string {
  return characters.charAt(randomIndex(characters.length))
}

/** At least one upper-case letter, one lower-case letter, one digit and one symbol, in random order. */
export function generateTemporaryPassword(length = TEMPORARY_PASSWORD_LENGTH): string {
  const characters = CHARACTER_SETS.map(randomCharacter)
  while (characters.length < length) characters.push(randomCharacter(ALL_CHARACTERS))
  for (let index = characters.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1)
    ;[characters[index], characters[other]] = [characters[other] ?? '', characters[index] ?? '']
  }
  return characters.join('')
}
