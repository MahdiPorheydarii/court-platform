// Where the AcePair API lives. When unset, the app runs in "showcase" mode on
// the built-in demo data so it always looks alive — set NEXT_PUBLIC_API_URL to
// point the UI at a live backend.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '')
export const API_ENABLED = API_BASE.length > 0

export const TOKEN_KEY = 'acepair.token'
