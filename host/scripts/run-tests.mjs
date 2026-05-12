#!/usr/bin/env node
// Wrapper around `vitest run`. Vitest 4's interactive reporter doesn't
// reliably print to non-TTY stdout (so `bun run test 2>&1 | tee` shows
// nothing). This wrapper:
//   1. runs vitest with --reporter=json piped to a temp file
//   2. ALSO inherits stdio so the user sees vitest's TTY UI when interactive
//   3. on completion, parses the JSON and prints a plain-text summary that
//      survives piping, scrollback, and CI logs
//
// Exits with vitest's own exit code so CI gates work normally.
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tmp = mkdtempSync(join(tmpdir(), 'vitest-'))
const out = join(tmp, 'results.json')

const args = ['vitest', 'run', '--reporter=verbose', '--reporter=json', `--outputFile.json=${out}`, ...process.argv.slice(2)]

const proc = spawn('bun', args, { stdio: 'inherit' })

proc.on('exit', (code) => {
  let summary
  try {
    summary = JSON.parse(readFileSync(out, 'utf8'))
  } catch {
    process.exit(code ?? 1)
  }

  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Test Files: ${summary.numPassedTestSuites}/${summary.numTotalTestSuites} passed`)
  console.log(`  Tests:      ${summary.numPassedTests}/${summary.numTotalTests} passed`)
  if (summary.numPendingTests > 0) {
    console.log(`  Skipped:    ${summary.numPendingTests}`)
  }
  if (summary.numFailedTests > 0) {
    console.log(`  Failed:     ${summary.numFailedTests}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (summary.numFailedTests > 0) {
    console.log('')
    console.log('Failed tests:')
    for (const file of summary.testResults) {
      for (const t of file.assertionResults) {
        if (t.status === 'failed') {
          console.log(`  ✗ ${file.name.replace(process.cwd() + '/', '')} › ${t.title}`)
          for (const msg of t.failureMessages || []) {
            console.log('    ' + msg.split('\n').slice(0, 5).join('\n    '))
          }
        }
      }
    }
  }

  process.exit(code ?? 0)
})
