import { test } from '@substrate-system/tapzero'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js')

const handle = '@nichoth.com'

test('did command resolves handle to DID document', async t => {
    const result = await runCLI(['did', handle])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output valid JSON
    try {
        const didDoc = JSON.parse(result.stdout)
        t.ok(didDoc.id, 'DID document should have an id field')
        t.ok(didDoc.id.startsWith('did:'), 'id should be a DID')
    } catch (_err) {
        t.fail('Should output valid JSON DID document')
    }
})

test('did command handles handle without @ prefix', async t => {
    const result = await runCLI(['did', 'nichoth.com'])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output valid JSON
    try {
        const didDoc = JSON.parse(result.stdout)
        t.ok(didDoc.id, 'DID document should have an id field')
    } catch (_err) {
        t.fail('Should output valid JSON DID document')
    }
})

test('did command shows DID document structure', async t => {
    const result = await runCLI(['did', handle])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output valid JSON with expected fields
    try {
        const didDoc = JSON.parse(result.stdout)
        t.ok(didDoc.id, 'DID document should have an id field')
        t.ok(didDoc.alsoKnownAs,
            'DID document should have alsoKnownAs field')
        t.ok(didDoc.verificationMethod,
            'DID document should have verificationMethod')
    } catch (_err) {
        t.fail('Should be able to parse DID document JSON')
    }
})

test('did command with invalid handle shows error', async t => {
    const result = await runCLI([
        'did',
        'this-handle-definitely-does-not-exist.invalid'
    ])

    t.ok(result.code !== 0,
        'command should exit with non-zero code for invalid handle')
    t.ok(result.stdout.includes('Error') || result.stderr.length > 0,
        'should show error message')
})

test('did command with --log flag fetches audit log', async t => {
    const result = await runCLI(['did', handle, '--log'])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output valid JSON
    try {
        const log = JSON.parse(result.stdout)
        t.ok(Array.isArray(log), 'audit log should be an array')
        if (log.length > 0) {
            t.ok(log[0].cid, 'log entries should have a cid field')
            t.ok(log[0].operation, 'log entries should have an operation field')
        }
    } catch (_err) {
        t.fail('Should output valid JSON audit log')
    }
})

test('did command with -l flag (short form) fetches audit log', async t => {
    const result = await runCLI(['did', handle, '-l'])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output valid JSON
    try {
        const log = JSON.parse(result.stdout)
        t.ok(Array.isArray(log), 'audit log should be an array')
    } catch (_err) {
        t.fail('Should output valid JSON audit log')
    }
})

test('did command --log shows different output than regular did', async t => {
    const regularResult = await runCLI(['did', handle])
    const logResult = await runCLI(['did', handle, '--log'])

    t.equal(regularResult.code, 0, 'regular command should succeed')
    t.equal(logResult.code, 0, 'log command should succeed')

    const regularDoc = JSON.parse(regularResult.stdout)
    const logDoc = JSON.parse(logResult.stdout)

    // Regular output has 'id' field (DID document)
    t.ok(regularDoc.id, 'regular output should be a DID document with id')

    // Log output is an array
    t.ok(Array.isArray(logDoc), 'log output should be an array')

    // They should be different
    t.notEqual(regularResult.stdout, logResult.stdout,
        'log and regular output should be different')
})

// Test the `aka` command
test('aka command requires handle and URL arguments', async t => {
    const result = await runCLI(['aka'])

    t.ok(result.code !== 0,
        'command should exit with non-zero code when missing arguments')
    t.ok(result.stderr.includes('Not enough non-option arguments'),
        'should show error about missing arguments')
})

test('aka command shows help with --help flag', async t => {
    const result = await runCLI(['aka', '--help'])

    t.equal(result.code, 0, 'help command should exit with code 0')
    t.ok(result.stdout.includes('Add a URL to your DID document'),
        'should show command description')
    t.ok(result.stdout.includes('handle'), 'should mention handle parameter')
    t.ok(result.stdout.includes('URL'), 'should mention URL parameter')
})

// general CLI behavior
test('CLI shows help when called without arguments', async t => {
    const result = await runCLI([])

    t.ok(result.code !== 0,
        'should exit with non-zero code when no command provided')
    t.ok(result.stderr.includes('You need to specify a command'),
        'should show message about needing a command')
})

test('CLI shows version with --version flag', async t => {
    const result = await runCLI(['--version'])

    t.equal(result.code, 0, 'version command should exit with code 0')
    t.ok(result.stdout.length > 0, 'should output version')
})

test('CLI shows help with --help flag', async t => {
    const result = await runCLI(['--help'])

    t.equal(result.code, 0, 'help command should exit with code 0')
    t.ok(result.stdout.includes('aka'), 'should list aka command')
    t.ok(result.stdout.includes('did'), 'should list did command')
})

/**
 * Helper function to run the CLI command and capture output
 */
function runCLI (args:string[]):Promise<{
    stdout:string
    stderr:string
    code:number | null
}> {
    return new Promise((resolve) => {
        const child = spawn('node', [CLI_PATH, ...args])
        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        child.on('close', (code) => {
            resolve({ stdout, stderr, code })
        })
    })
}
