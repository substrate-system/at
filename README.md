# at

[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/at/nodejs.yml?style=flat-square)](https://github.com/substrate-system/at/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/at?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](https://common-changelog.org)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


A typescript/node CLI client for [at protocol](https://atproto.com/) (bluesky).

This exposes a CLI tool, `at`, that you can use to make requests to
your [DID document](https://atproto.com/specs/did).

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Use](#use)
  * [`aka` command](#aka-command)
    + [Example](#example)
    + [Using a custom PDS](#using-a-custom-pds)
  * [`did` command](#did-command)
    + [Example](#example-1)
- [How it works](#how-it-works)

<!-- tocstop -->

</details>

## Install

```sh
npm i @substrate-system/at
```

## Use

### `aka` command

Add a URL to your DID's `alsoKnownAs` property.

The `aka` command lets you link external URLs, like Github,
to your Bluesky DID document.

If you did not install this glabally via `npm i -g @substrate-system/at`,
then use `npx` to execute it.

```bash
npx at aka <handle> <URL> [--pds <custom-pds>]
```

**Arguments**

- `<handle>` - Your Bluesky handle (e.g., `alice.bsky.social`)
- `<URL>` - The URL to link (e.g., `https://github.com/alice`)
- `--pds` - (Optional) Custom PDS server URL. Defaults to `https://bsky.social`


#### Example

Link to your github profile.

```sh
at aka alice.bsky.social https://github.com/alice
```

This command will:
1. Prompt you for your Bluesky password
2. Send a verification code to your email
3. Ask you to enter the verification code
4. Update your DID document so that it includes your GitHub URL in
   the `alsoKnownAs` property

The resulting `alsoKnownAs` array in your DID document will contain:

```js
[
  "at://alice.bsky.social",
  "https://github.com/alice"
]
```

#### Using a custom PDS

Pass in the `--pds` argument with PDS URL.

```sh
at aka alice.example.com https://alice.com --pds https://pds.example.com
```

### `did` command

Fetch the DID document for a handle.

```
npx at did <handle> [--pds <custom-pds>]
```

**Arguments**

- `<handle>` - A Bluesky handle (e.g., `alice.bsky.social` or `@alice.bsky.social`)
- `--pds` - (Optional) Custom PDS server URL for handle resolution. Defaults to `https://bsky.social`

#### Example

Get a DID document for `@nichoth.com`:

```sh
npx at did @nichoth.com
```

```js
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/multikey/v1",
    "https://w3id.org/security/suites/secp256k1-2019/v1"
  ],
  "id": "did:plc:s53e6k6sirobjtz5s6vdddwr",
  "alsoKnownAs": [
    "at://nichoth.com",
    "https://github.com/nichoth/"
  ],
  "verificationMethod": [
    {
      "id": "did:plc:s53e6k6sirobjtz5s6vdddwr#atproto",
      "type": "Multikey",
      "controller": "did:plc:s53e6k6sirobjtz5s6vdddwr",
      "publicKeyMultibase": "zQ3shnSayXqCvnetx9S5BaHVEXPovHqpKcXwK2oRwAWPVKmdz"
    }
  ],
  "service": [
    {
      "id": "#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://lionsmane.us-east.host.bsky.network"
    }
  ]
}
```

Extract fields using `jq`:

```sh
# Get the DID string
npx at did alice.bsky.social | jq -r '.id'

# Get the alsoKnownAs array
npx at did alice.bsky.social | jq '.alsoKnownAs'

# Get the PDS endpoint
npx at did alice.bsky.social | jq -r '.service[] | select(.type == "AtprotoPersonalDataServer") | .serviceEndpoint'
```

**Output**

Returns a JSON object containing:

- `id` - The DID identifier
- `alsoKnownAs` - Array of alternative identifiers
- `verificationMethod` - Cryptographic keys for the identity
- `service` - Service endpoints (like the PDS server)

## How it works

The AT Protocol uses [DID (Decentralized Identifier)](https://atproto.com/specs/did)
documents as user identity. Each DID can include an
`alsoKnownAs` field that links to other identifiers or URLs.

This uses the
[@atproto/api](https://www.npmjs.com/package/@atproto/api) client.
