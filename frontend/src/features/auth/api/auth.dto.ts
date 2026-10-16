/** Raw shapes of the auth service. PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02). */

/** Body of `POST /auth/login`. */
export interface LoginRequestDto {
  username: string
  password: string
}

/** Response of `POST /auth/login`. The token is a JWT that expires after 15 minutes. */
export interface LoginResponseDto {
  access_token: string
}

/** Claims inside the access token (backend: `auth.service.ts`). */
export interface AccessTokenPayloadDto {
  sub: number | string
  username: string
  role: string
  iat?: number
  exp?: number
}
