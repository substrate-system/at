#!/usr/bin/env node
import 'dotenv/config'
import yargs from 'yargs'
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

async function didCommand (args:DidArgs) {
    let { handle } = args
    const { pds = 'https://bsky.social' } = args

    // Strip '@' prefix if present
    handle = handle.startsWith('@') ? handle.slice(1) : handle

    try {
        // Create an agent (no login needed for public operations)
        const agent = new AtpAgent({ service: pds })

        // Resolve handle to DID
        const response = await agent.resolveHandle({ handle })
        const did = response.data.did

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

yargs(hideBin(process.argv))
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
        },
        (argv) => {
            didCommand({
                handle: argv.handle as string,
                pds: argv.pds as string
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
