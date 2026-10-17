export type ScopeContext =
  | { kind: 'unrestricted' }
  | { kind: 'restricted'; userId: number }
  | { kind: 'empty' };
