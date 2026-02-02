#!/usr/bin/env node
import 'dotenv/config'
import yargs from 'yargs'
import { Secp256k1Keypair } from '@atproto/crypto'
import { secp256k1 } from '@noble/curves/secp256k1'
import { hideBin } from 'yargs/helpers'
import { AtpAgent } from '@atproto/api'
import { password, input } from '@inquirer/prompts'
import chalk from 'chalk'
import { type DidDocument } from '@atproto/identity'

interface AkaArgs {
    handle:string;
    urls:string[];
    pds?:string;
}

interface DidArgs {
    handleOrDid:string;  // handle or DID string
    pds?:string;
    log?:boolean;
}

interface RotationArgs {
    handle:string;
    key?:string;
    pds?:string;
    format:'hex'|'json'|'jwk';
}

interface RemoveArgs {
    handle:string;
    key:string;  // <-- the public key
    pds?:string;
}

/**
 * secp256k1 should be hex format private key for @atproto/crypto import
 * https://github.com/bluesky-social/atproto/blob/c2615a7eee6da56a43835adb09c5901a1872efd3/packages/crypto/src/secp256k1/keypair.ts#L41
 */

yargs(hideBin(process.argv))
    .command(
        'rotation <handle> [key]',
        'Add or remove a rotation key to a Bluesky account',
        (yargs) => {
            return yargs
                .positional('handle', {
                    describe: 'Your Bluesky handle (e.g., nichoth.com)',
                    type: 'string',
                    demandOption: true
                })
                .positional('key', {
                    describe: 'The private key (hex) for the new rotation key. ' +
                        'If not provided, a new keypair will be generated',
                    type: 'string'
                })
                .option('pds', {
                    describe: 'Custom PDS server URL',
                    type: 'string',
                    default: 'https://bsky.social'
                })
                .option('remove', {
                    alias: 'rm',
                    type: 'string',
                    describe: 'Remove the given rotation key. The key should ' +
                        'be in multikey format (the DID string is fine).'
                })
                .option('format', {
                    alias: 'f',
                    describe: 'The output format for the generated keypair. ' +
                        '`json` means an object like { publicKey, privateKey },' +
                        'where public key is a DID string, private key is ' +
                        'hex encoded. For `hex` format, only the private key ' +
                        'is returned.',
                    type: 'string',
                    choices: ['hex', 'json', 'jwk'],
                    default: 'json'
                })
        },
        async (argv) => {
            if (argv.remove) {
                await removeCommand({
                    pds: argv.pds,
                    handle: argv.handle,
                    key: argv.remove
                })
            } else {
                rotationCommand({
                    handle: argv.handle!,
                    key: argv.key,
                    pds: argv.pds,
                    format: argv.format as 'hex' | 'json' | 'jwk'
                }).catch((error) => {
                    console.error(chalk.red.bold('Unexpected error:'), error)
                    process.exit(1)
                })
            }
        }
    )
    .command(
        'keys',
        'Generate a new secp256k1 keypair',
        (yargs) => {
            return yargs
                .option('format', {
                    alias: 'f',
                    describe: 'The output format. By default will print ' +
                        'the private key only as hex',
                    type: 'string',
                    choices: ['hex', 'json', 'jwk'],
                    default: 'hex'
                })
        },
        async (argv) => {
            try {
                await keysCommand({ format: argv.format as 'hex'|'json'|'jwk' })
            } catch (error) {
                console.error(chalk.red.bold('Unexpected error:'), error)
                process.exit(1)
            }
        }
    )
    .command(
        'aka <handle> <URL>',
        'Add a URL to your DID document alsoKnownAs',
        (yargs) => {
            return yargs
                .positional('handle', {
                    describe: 'Your Bluesky handle (e.g., nichoth.com)',
                    type: 'string',
                    demandOption: true
                })
                .positional('URL', {
                    describe: 'a URL (e.g., https://github.com/nichoth)',
                    type: 'string',
                    demandOption: true
                })
                .option('pds', {
                    describe: 'Custom PDS server URL',
                    type: 'string',
                    default: 'https://bsky.social'
                })
        },
        (argv) => {
            if (!argv.URL) throw new Error('empty url')

            akaCommand({
                handle: argv.handle as string,
                urls: (argv.URL as string).split(' '),
                pds: argv.pds as string
            }).catch((error) => {
                console.error(chalk.red.bold('Unexpected error:'), error)
                process.exit(1)
            })
        }
    )
    .command(
        'did <handleOrDid>',
        'Get the DID document for a given handle or DID',
        (yargs) => {
            return yargs
                .positional('handleOrDid', {
                    describe: 'A Bluesky handle (e.g., nichoth.com) or DID (e.g., did:plc:abc123)',
                    type: 'string',
                    demandOption: true
                })
                .option('pds', {
                    describe: 'Custom PDS server URL for handle resolution',
                    type: 'string',
                    default: 'https://bsky.social'
                })
                .option('log', {
                    alias: 'l',
                    describe: 'Fetch audit log from PLC directory',
                    type: 'boolean',
                    default: false
                })
        },
        (argv) => {
            didCommand({
                handleOrDid: argv.handleOrDid as string,
                pds: argv.pds as string,
                log: argv.log as boolean
            }).catch((error) => {
                console.error(chalk.red.bold('Unexpected error:'), error)
                process.exit(1)
            })
        }
    )
    .demandCommand(1, 'You need to specify a command')
    .help()
    .alias('h', 'help')
    .version()
    .alias('v', 'version')
    .strict()
    .parse()

async function didCommand (args:DidArgs):Promise<DidDocument> {
    const { handleOrDid } = args
    const { pds = 'https://bsky.social', log = false } = args

    // Strip '@' prefix if present
    const handle = handleOrDid.startsWith('@') ?
        handleOrDid.slice(1) :
        handleOrDid

    try {
        let did:string

        if (handleOrDid.startsWith('did:')) {
            // Already a DID string, use directly
            did = handleOrDid
        } else {
            // Create an agent (no login needed for public operations)
            const agent = new AtpAgent({ service: pds })

            // Resolve handle to DID
            const response = await agent.resolveHandle({ handle })
            did = response.data.did
        }

        // If log flag is set, fetch and print the audit log
        if (log) {
            if (!did.startsWith('did:plc:')) {
                throw new Error('Audit log is only available for did:plc: ' +
                    'identifiers')
            }
            const logData = await getDidLog(did)
            console.log(JSON.stringify(logData, null, 2))
            const plcResponse = await fetch(`https://plc.directory/${did}`)
            const didDoc = await plcResponse.json() as DidDocument
            return didDoc
        }

        // Fetch DID document
        let didDoc
        if (did.startsWith('did:plc:')) {
            // Fetch from PLC directory
            const plcResponse = await fetch(`https://plc.directory/${did}`)
            didDoc = await plcResponse.json()
        } else if (did.startsWith('did:web:')) {
            // Handle did:web
            const webPart = did.replace('did:web:', '').replace(':', '/')
            const webUrl = `https://${webPart}/.well-known/did.json`
            const webResponse = await fetch(webUrl)
            didDoc = await webResponse.json()
        } else {
            throw new Error(`Unsupported DID method: ${did}`)
        }

        console.log(JSON.stringify(didDoc, null, 2))

        return didDoc
    } catch (err) {
        console.error(chalk.red.bold('\nError...'), err instanceof Error ?
            err.message :
            String(err)
        )
        process.exit(1)
    }
}

async function akaCommand (args:AkaArgs) {
    const { handle, urls, pds = 'https://bsky.social' } = args

    console.log(chalk.blue(`\nSetting up aka for ${chalk.bold(handle)}`))
    console.log(chalk.gray(`PDS: ${pds}`))
    console.log(chalk.gray(`URLs: ${urls.join(' ')}\n`))

    try {
        // Step 1: Login
        console.log(chalk.cyan('Step 1: Login'))
        const passwordInput = await password({
            message: `Enter password for ${handle}:`,
            mask: '*'
        })

        const agent = new AtpAgent({ service: pds })
        await agent.login({ identifier: handle, password: passwordInput })
        console.log(chalk.green('Logged in successfully\n'))

        // Step 2: Request email code
        console.log(chalk.cyan('Step 2: Requesting email verification code'))
        await agent.com.atproto.identity.requestPlcOperationSignature()
        console.log(chalk.green('✓ Email sent. Check your inbox\n'))

        // Step 3: Get email code from user
        console.log(chalk.cyan('Step 3: Email verification'))
        const emailCode = await input({
            message: 'Enter the code from your email:',
            validate: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter the verification code'
                }
                return true
            }
        })

        // Step 4: Sign and submit the PLC operation
        console.log(chalk.cyan('\nStep 4: Signing and submitting PLC operation'))

        const alsoKnownAs = [`at://${handle}`, ...urls]

        const signed = await agent.com.atproto.identity.signPlcOperation({
            token: emailCode.trim(),
            alsoKnownAs
        })

        await agent.com.atproto.identity.submitPlcOperation({
            operation: signed.data.operation
        })

        console.log(chalk.green.bold('\n Success Updated DID `alsoKnownAs`'))
        console.log(chalk.gray('Your identity now includes:'))
        alsoKnownAs.forEach(aka => {
            console.log(chalk.gray(`  - ${aka}`))
        })
    } catch (err) {
        console.error(chalk.red.bold('\nError...'), err instanceof Error ?
            err.message :
            String(err)
        )
        process.exit(1)
    }
}

async function keysCommand (opts:{ format:'hex'|'json'|'jwk' }) {
    const { format } = opts
    const keypair = await Secp256k1Keypair.create({ exportable: true })

    // Export private key and convert to hex string
    const privateKeyBytes = await keypair.export()
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex')

    if (format === 'hex') {
        // Default: print only private key as hex
        console.log(privateKeyHex)
    } else if (format === 'json') {
        // JSON format with both keys
        // Public key is in did:key format
        const didKey = keypair.did()

        console.log(JSON.stringify({
            publicKey: didKey,
            privateKey: privateKeyHex
        }, null, 2))
    } else if (format === 'jwk') {
        // Export as JSON Web Key format
        // Note: secp256k1 is not an IANA-registered curve for JWK standard,
        // but this follows the JWK EC key structure
        const compressedPubkey = keypair.publicKeyBytes()

        // Decompress the public key to get x and y coordinates
        const point = secp256k1.Point.fromHex(compressedPubkey)
        const uncompressedPubkey = point.toRawBytes(false)

        // Uncompressed key format: [0x04, x (32 bytes), y (32 bytes)]
        const x = uncompressedPubkey.slice(1, 33)
        const y = uncompressedPubkey.slice(33, 65)

        const jwk = {
            kty: 'EC',
            crv: 'secp256k1',
            x: Buffer.from(x).toString('base64url'),
            y: Buffer.from(y).toString('base64url'),
            d: Buffer.from(privateKeyBytes).toString('base64url'),
            key_ops: ['sign']
        }
        console.log(JSON.stringify(jwk, null, 2))
    }
}

async function removeCommand (args: RemoveArgs) {
    const { pds = 'https://bsky.social', key: rawKey, handle } = args
    // Allow passing in either the full did:key string or just the key part
    const key = rawKey.startsWith('did:key:') ? rawKey : `did:key:${rawKey}`

    console.log(chalk.blue(`\nRemoving rotation key for ${chalk.bold(handle)}`))
    console.log(chalk.gray(`PDS: ${pds}`))
    console.log(chalk.gray(`Key to remove: ${key}\n`))

    try {
        // Step 1: Login
        console.log(chalk.cyan('Step 1: Login'))
        const passwordInput = await password({
            message: `Enter password for ${handle}:`,
            mask: '*'
        })

        const agent = new AtpAgent({ service: pds })
        await agent.login({ identifier: handle, password: passwordInput })
        console.log(chalk.green('✓ Logged in successfully\n'))

        // Step 2: Get current rotation keys
        console.log(chalk.cyan('Step 2: Fetching current DID credentials'))

        const { data } = await agent.resolveHandle({ handle })
        const did = data.did

        let currentRotationKeys: string[] = []
        let currentVerificationMethods: any
        let currentServices: any
        let currentAlsoKnownAs: string[] | undefined

        if (did.startsWith('did:plc:')) {
            const log = await getDidLog(did)
            const lastEntry = log[log.length - 1]
            if (lastEntry) {
                // The log entry might be null creation or having keys
                // We need to look at the operation payload actually.
                // The getDidLog returns the *audit* log which includes `operation` object?
                // Let's check getDidLog implementation.
                // It fetches /log/audit => returns array of { cid, nullified, created, operation, ... }
                // The 'operation' field contains the actual PLC op (rotationKeys, etc)

                // However, `getDidLog` as implemented in this file returns `Record<string, any>[]`.
                // We need to ensure we access the operation details correctly.
                // The PLC audit log entry has an 'operation' which is the signed op.
                // But wait, the audit log entries are wrappers. The 'operation' field IS the op object?
                // Let's verify.
                // Checking existing test `did command with --log flag...`:
                // t.ok(log[0].operation, 'log entries should have an operation field')

                currentRotationKeys = lastEntry.operation.rotationKeys || []
                currentVerificationMethods = lastEntry.operation.verificationMethods
                currentServices = lastEntry.operation.services
                currentAlsoKnownAs = lastEntry.operation.alsoKnownAs
            }
        } else {
            // Fallback for non-plc (though rotation might not be supported this way)
            const current = await agent.com.atproto.identity
                .getRecommendedDidCredentials()
            currentRotationKeys = current.data.rotationKeys || []
            currentVerificationMethods = current.data.verificationMethods
            currentServices = current.data.services
            currentAlsoKnownAs = current.data.alsoKnownAs
        }

        console.log(chalk.green('✓ Retrieved current credentials\n'))

        // Check if key exists in current rotation keys
        if (!currentRotationKeys.includes(key)) {
            console.log(chalk.red(`⚠ The key ${key} is not in your ` +
                'list of rotation keys.'))
            console.log(chalk.gray('Current rotation keys:'))
            currentRotationKeys.forEach(k => console.log(chalk.gray(`  - ${k}`)))
            return
        }

        // Step 3: Request email verification
        console.log(chalk.cyan('Step 3: Requesting email verification code'))
        await agent.com.atproto.identity.requestPlcOperationSignature()
        console.log(chalk.green('✓ Email sent. Check your inbox\n'))

        // Step 4: Get email code from user
        console.log(chalk.cyan('Step 4: Email verification'))
        const emailCode = await input({
            message: 'Enter the code from your email:',
            validate: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter the verification code'
                }
                return true
            }
        })

        // Step 5: Sign and submit the PLC operation
        console.log(chalk.cyan('\nStep 5: Signing and submitting PLC operation'))

        // Filter out the key to remove
        const newRotationKeys = currentRotationKeys.filter(k => k !== key)

        const signed = await agent.com.atproto.identity.signPlcOperation({
            token: emailCode.trim(),
            rotationKeys: newRotationKeys,
            verificationMethods: currentVerificationMethods,
            services: currentServices,
            alsoKnownAs: currentAlsoKnownAs
        })

        await agent.com.atproto.identity.submitPlcOperation({
            operation: signed.data.operation
        })

        console.log(chalk.green.bold('\n✓ Success! Removed rotation key'))
        console.log(chalk.gray('Your DID now includes these rotation keys:'))
        if (newRotationKeys.length === 0) {
            console.log(chalk.gray('  (none)'))
        } else {
            newRotationKeys.forEach(k => {
                console.log(chalk.gray(`  - ${k}`))
            })
        }
    } catch (err) {
        console.error(chalk.red.bold('\nError...'), err instanceof Error ?
            err.message :
            String(err)
        )
        process.exit(1)
    }
}

async function rotationCommand (args: RotationArgs) {
    const { handle, key, pds = 'https://bsky.social', format } = args

    console.log(chalk.blue(`\nAdding rotation key for ${chalk.bold(handle)}`))
    console.log(chalk.gray(`PDS: ${pds}\n`))

    try {
        // Step 1: Get or generate the private key
        let privateKeyHex: string
        let isNewKey = false

        if (key) {
            privateKeyHex = key
        } else {
            // Generate a new keypair
            console.log(chalk.cyan('Generating new keypair...'))
            const newKeypair = await Secp256k1Keypair.create({ exportable: true })
            const privateKeyBytes = await newKeypair.export()
            privateKeyHex = Buffer.from(privateKeyBytes).toString('hex')
            isNewKey = true
            console.log(chalk.green('✓ New keypair generated\n'))
        }

        // Validate hex format
        if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
            throw new Error('Invalid private key format. Expected 64 ' +
                'character hex string')
        }

        // Step 2: Import the keypair and generate did:key
        console.log(chalk.cyan('Step 1: Generating did:key from private key'))
        const keypair = await Secp256k1Keypair.import(privateKeyHex, {
            exportable: true
        })
        const didKey = keypair.did()
        console.log(chalk.gray(`New rotation key: ${didKey}\n`))

        // Step 3: Login
        console.log(chalk.cyan('Step 2: Login'))
        const passwordInput = await password({
            message: `Enter password for ${handle}:`,
            mask: '*'
        })

        const agent = new AtpAgent({ service: pds })
        await agent.login({ identifier: handle, password: passwordInput })
        console.log(chalk.green('✓ Logged in successfully\n'))

        // Step 4: Get current DID credentials
        console.log(chalk.cyan('Step 3: Fetching current DID credentials'))
        const current = await agent.com.atproto.identity
            .getRecommendedDidCredentials()
        console.log(chalk.green('✓ Retrieved current credentials\n'))

        // Check if key already exists
        if (current.data.rotationKeys?.includes(didKey)) {
            console.log(chalk.yellow('⚠ This rotation key already exists in ' +
                'your DID document'))
            return
        }

        // Step 5: Request email verification
        console.log(chalk.cyan('Step 4: Requesting email verification code'))
        await agent.com.atproto.identity.requestPlcOperationSignature()
        console.log(chalk.green('✓ Email sent. Check your inbox\n'))

        // Step 6: Get email code from user
        console.log(chalk.cyan('Step 5: Email verification'))
        const emailCode = await input({
            message: 'Enter the code from your email:',
            validate: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter the verification code'
                }
                return true
            }
        })

        // Step 7: Sign and submit the PLC operation
        console.log(chalk.cyan('\nStep 6: Signing and submitting PLC operation'))

        // Add new rotation key while keeping existing ones
        const newRotationKeys = [
            ...(current.data.rotationKeys || []),
            didKey
        ]

        const signed = await agent.com.atproto.identity.signPlcOperation({
            token: emailCode.trim(),
            rotationKeys: newRotationKeys,
            verificationMethods: current.data.verificationMethods,
            services: current.data.services,
            alsoKnownAs: current.data.alsoKnownAs
        })

        await agent.com.atproto.identity.submitPlcOperation({
            operation: signed.data.operation
        })

        console.log(chalk.green.bold('\n✓ Success! Added rotation key'))
        console.log(chalk.gray('Your DID now includes these rotation keys:'))
        newRotationKeys.forEach(key => {
            console.log(chalk.gray(`  - ${key}`))
        })

        // Output the keypair in the requested format (only if it's a new key)
        if (isNewKey) {
            console.log() // Empty line for separation
            if (format === 'hex') {
                // Default: print only private key as hex
                console.log(privateKeyHex)
            } else if (format === 'json') {
                // JSON format with both keys
                console.log(JSON.stringify({
                    publicKey: didKey,
                    privateKey: privateKeyHex
                }, null, 2))
            } else if (format === 'jwk') {
                // Export as JSON Web Key format
                const privateKeyBytes = Buffer.from(privateKeyHex, 'hex')
                const compressedPubkey = keypair.publicKeyBytes()

                // Decompress the public key to get x and y coordinates
                const point = secp256k1.Point.fromHex(compressedPubkey)
                const uncompressedPubkey = point.toRawBytes(false)

                // Uncompressed key format: [0x04, x (32 bytes), y (32 bytes)]
                const x = uncompressedPubkey.slice(1, 33)
                const y = uncompressedPubkey.slice(33, 65)

                const jwk = {
                    kty: 'EC',
                    crv: 'secp256k1',
                    x: Buffer.from(x).toString('base64url'),
                    y: Buffer.from(y).toString('base64url'),
                    d: Buffer.from(privateKeyBytes).toString('base64url'),
                    key_ops: ['sign']
                }
                console.log(JSON.stringify(jwk, null, 2))
            }
        }
    } catch (err) {
        console.error(chalk.red.bold('\nError...'), err instanceof Error ?
            err.message :
            String(err)
        )
        process.exit(1)
    }
}

async function getDidLog (did: string): Promise<Record<string, any>[]> {
    // The PLC directory provides a log endpoint:
    // https://plc.directory/{did}/log/audit
    const plcUrl = 'https://plc.directory'
    const response = await fetch(`${plcUrl}/${did}/log/audit`)

    if (!response.ok) {
        throw new Error(`Failed to fetch log: ${response.statusText}`)
    }

    const log = await response.json() as Record<string, any>[]
    return log
}
