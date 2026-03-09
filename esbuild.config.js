const esbuild = require('esbuild')
const builtins = require('builtin-modules')

const VAULT_PLUGIN_PATH =
  process.env.VAULT_PLUGIN_PATH ||
  '/home/harold/Workspace/brain/.obsidian/plugins/marpidian'

const isWatch = process.argv.includes('--watch')

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    '@lezer/*',
    ...builtins,
  ],
  format: 'cjs',
  platform: 'browser',
  outfile: `${VAULT_PLUGIN_PATH}/main.js`,
  watch: isWatch,
  sourcemap: isWatch ? 'inline' : false,
  logLevel: 'info',
})
