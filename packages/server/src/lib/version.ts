// Release version = the root package.json, the one the Release workflow bumps (the server's own never moves).
// Baked in by tsdown (`define`); absent when running from source (dev, tests).
declare const __KINORA_VERSION__: string | undefined

export const version = typeof __KINORA_VERSION__ === 'string' ? __KINORA_VERSION__ : '0.0.0-dev'
