#!/usr/bin/env node
import 'dotenv/config'
import yargs from 'yargs'
import { Secp256k1Keypair } from '@atproto/crypto'
import { secp256k1 } from '@noble/curves/secp256k1'
import * as u from 'uint8arrays'
import { hideBin } from 'yargs/helpers'
import { AtpAgent } from '@atproto/api'
import { password, input } from '@inquirer/prompts'
import chalk from 'chalk'

interface AkaArgs {
    handle:string
    url:string
    pds?:string
}

interface DidArgs {
    handle:string
    pds?:string
    log?:boolean
}

/**
 * secp256k1 should be hex format private key for @atproto/crypto import
 * https://github.com/bluesky-social/atproto/blob/c2615a7eee6da56a43835adb09c5901a1872efd3/packages/crypto/src/secp256k1/keypair.ts#L41
 */

yargs(hideBin(process.argv))
    .command(
        'keys',
        'Generate a new secp256k1 keypair',
        (yargs) => {
            return yargs
                .option('format', {
                    alias: 'f',
                    describe: 'The output format. By default will print the private key only as hex',
                    type: 'string',
                    choices: ['hex', 'json', 'jwk'],
                    default: 'hex'
                })
        },
        async (argv) => {
            try {
                await keysCommand({ format: argv.format as 'hex' | 'json' | 'jwk' })
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
                .positional('url', {
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
            if (!argv.url) throw new Error('not url')

            akaCommand({
                handle: argv.handle as string,
                url: argv.url,
                pds: argv.pds as string
            }).catch((error) => {
                console.error(chalk.red.bold('Unexpected error:'), error)
                process.exit(1)
            })
        }
    )
    .command(
        'did <handle>',
        'Get the DID document for a given handle',
        (yargs) => {
            return yargs
                .positional('handle', {
                    describe: 'A Bluesky handle (e.g., nichoth.com or @nichoth.com)',
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
                handle: argv.handle as string,
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

async function didCommand (args:DidArgs) {
    let { handle } = args
    const { pds = 'https://bsky.social', log = false } = args

    // Strip '@' prefix if present
    handle = handle.startsWith('@') ? handle.slice(1) : handle

    try {
        // Create an agent (no login needed for public operations)
        const agent = new AtpAgent({ service: pds })

        // Resolve handle to DID
        const response = await agent.resolveHandle({ handle })
        const did = response.data.did

        // If log flag is set, fetch and print the audit log
        if (log) {
            if (!did.startsWith('did:plc:')) {
                throw new Error('Audit log is only available for did:plc: identifiers')
            }
            const logData = await getDidLog(did)
            console.log(JSON.stringify(logData, null, 2))
            return
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
    } catch (err) {
        console.error(chalk.red.bold('\nError...'), err instanceof Error ?
            err.message :
            String(err)
        )
        process.exit(1)
    }
}

async function akaCommand (args:AkaArgs) {
    const { handle, url, pds = 'https://bsky.social' } = args

    console.log(chalk.blue(`\nSetting up aka for ${chalk.bold(handle)}`))
    console.log(chalk.gray(`PDS: ${pds}`))
    console.log(chalk.gray(`URL: ${url}\n`))

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

        const alsoKnownAs = [`at://${handle}`, url]

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

async function keysCommand (opts: { format: 'hex' | 'json' | 'jwk' }) {
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
        // Public key is multicodec format (secp256k1-pub with base58btc)
        const publicKeyBytes = keypair.publicKeyBytes()
        const multicodec = new Uint8Array([0xe7])  // secp256k1-pub
        const combined = new Uint8Array(multicodec.length + publicKeyBytes.length)
        combined.set(multicodec, 0)
        combined.set(publicKeyBytes, multicodec.length)
        // Encode with base58btc (z prefix)
        const publicKeyMulticodec = 'z' + u.toString(combined, 'base58btc')

        console.log(JSON.stringify({
            publicKey: publicKeyMulticodec,
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

/**
 * Add a rotation key.
 * @param {string} did The DID you are updating.
 */
async function rotate (opts:{ did?:string, pds?:string } = {}) {
    const { did, pds = 'https://bsky.social' } = opts
    if (!did) throw new Error('DID is required')
    const log = await getDidLog(did)
    const last = log[log.length - 1]
    const { cid } = last
    const agent = new AtpAgent({ service: pds })

    // have to send a signed request to the PLC Directory
    // the PDS has your current rotation key
}

async function getDidLog (did:string):Promise<Record<string, any>[]> {
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
