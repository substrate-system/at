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

// Test the `keys` command
test('keys command generates a keypair with default hex format', async t => {
    const result = await runCLI(['keys'])

    t.equal(result.code, 0, 'command should exit with code 0')

    // Should output a hex string (64 characters for 32 bytes)
    const output = result.stdout.trim()
    t.equal(output.length, 64, 'should output 64 character hex string')
    t.ok(/^[0-9a-f]{64}$/.test(output), 'should be valid lowercase hex')
})

test('keys command with --format hex outputs hex private key', async t => {
    const result = await runCLI(['keys', '--format', 'hex'])

    t.equal(result.code, 0, 'command should exit with code 0')

    const output = result.stdout.trim()
    t.equal(output.length, 64, 'should output 64 character hex string')
    t.ok(/^[0-9a-f]{64}$/.test(output), 'should be valid lowercase hex')
})

test('keys command with -f shorthand works', async t => {
    const result = await runCLI(['keys', '-f', 'hex'])

    t.equal(result.code, 0, 'command should exit with code 0')

    const output = result.stdout.trim()
    t.ok(/^[0-9a-f]{64}$/.test(output), 'should be valid hex output')
})

test('keys command with json format outputs both keys', async t => {
    const result = await runCLI(['keys', '--format', 'json'])

    t.equal(result.code, 0, 'command should exit with code 0')

    try {
        const keys = JSON.parse(result.stdout)
        t.ok(keys.publicKey, 'should have publicKey field')
        t.ok(keys.privateKey, 'should have privateKey field')

        // Public key is compressed (33 bytes = 66 hex chars, starts with 02 or 03)
        t.ok(/^0[23][0-9a-f]{64}$/.test(keys.publicKey),
            'publicKey should be valid compressed secp256k1 key')

        // Private key is 32 bytes = 64 hex chars
        t.equal(keys.privateKey.length, 64,
            'privateKey should be 64 character hex string')
        t.ok(/^[0-9a-f]{64}$/.test(keys.privateKey),
            'privateKey should be valid hex')
    } catch (_err) {
        t.fail('Should output valid JSON with key fields')
    }
})

test('keys command with jwk format outputs JSON Web Key', async t => {
    const result = await runCLI(['keys', '--format', 'jwk'])

    t.equal(result.code, 0, 'command should exit with code 0')

    try {
        const jwk = JSON.parse(result.stdout)
        t.equal(jwk.kty, 'EC', 'should have kty field set to EC')
        t.equal(jwk.crv, 'secp256k1', 'should have crv field set to secp256k1')
        t.ok(jwk.x, 'should have x coordinate')
        t.ok(jwk.y, 'should have y coordinate')
        t.ok(jwk.d, 'should have d (private key)')
        t.ok(Array.isArray(jwk.key_ops), 'should have key_ops array')
        t.ok(jwk.key_ops.includes('sign'), 'key_ops should include sign')

        // Check base64url format (alphanumeric plus - and _)
        t.ok(/^[A-Za-z0-9_-]+$/.test(jwk.x), 'x should be base64url encoded')
        t.ok(/^[A-Za-z0-9_-]+$/.test(jwk.y), 'y should be base64url encoded')
        t.ok(/^[A-Za-z0-9_-]+$/.test(jwk.d), 'd should be base64url encoded')
    } catch (_err) {
        t.fail('Should output valid JWK format')
    }
})

test('keys command generates different keys each time', async t => {
    const result1 = await runCLI(['keys'])
    const result2 = await runCLI(['keys'])

    t.equal(result1.code, 0, 'first command should succeed')
    t.equal(result2.code, 0, 'second command should succeed')

    t.notEqual(result1.stdout.trim(), result2.stdout.trim(),
        'should generate different keys each time')
})

test('keys command shows help with --help flag', async t => {
    const result = await runCLI(['keys', '--help'])

    t.equal(result.code, 0, 'help command should exit with code 0')
    t.ok(result.stdout.includes('Generate a new secp256k1 keypair'),
        'should show command description')
    t.ok(result.stdout.includes('format'), 'should mention format option')
    t.ok(result.stdout.includes('hex'), 'should mention hex format')
    t.ok(result.stdout.includes('json'), 'should mention json format')
    t.ok(result.stdout.includes('jwk'), 'should mention jwk format')
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
    t.ok(result.stdout.includes('keys'), 'should list keys command')
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
