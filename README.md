# at

[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/at/nodejs.yml?style=flat-square)](https://github.com/substrate-system/at/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/at?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](https://common-changelog.org)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/at?cache-control=no-cache)](https://packagephobia.com/result?p=@substrate-system/at)
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
    + [Arguments](#arguments)
    + [Example](#example-1)
  * [`rotation` command](#rotation-command)
    + [Arguments](#arguments-1)
    + [Example: Add a key](#example-add-a-key)
    + [Example: Remove a key](#example-remove-a-key)
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
to your Bluesky DID document. See
[verify.aviary.domains](https://verify.aviary.domains/did/did:plc:cbkjy5n7bk3ax2wplmtjofq2)
to lookup your DID document and see the also known as values.

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
npx at did <handle> [--pds <custom-pds>] [--log]
```

#### Arguments

- `<handle>` - A Bluesky handle
  (e.g., `alice.bsky.social` or `@alice.bsky.social`)
- `--pds` - (Optional) Custom PDS server URL for handle resolution.
  Defaults to `https://bsky.social`
- `--log`, `-l` - (Optional) Fetch the audit log instead of the DID document.
  Only available for `did:plc:` identifiers, not `did:web`.


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
# => did:plc:vdjlpwlhbnug4fnjodwr3vzh

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

**Audit Log**

Use the `--log` or `-l` flag to fetch the audit log for a DID from the PLC directory. This shows the history of changes to the DID document:

```sh
npx at did @nichoth.com --log
```

The audit log returns an array of operations with their CIDs and timestamps:

```js
[
  {
    "cid": "bafyreid...",
    "nullified": false,
    "operation": {
      "type": "plc_operation",
      "services": { ... },
      "alsoKnownAs": [...],
      // ... other operation details
    },
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  // ... previous operations
]
```

### `rotation` command
Add or remove a rotation key. This will require you to verify the operation
by clicking an email.

```
npx at rotation <handle> [key] [--pds <custom-pds>] [--format <format>] [--remove <key-to-remove>]
```

#### Arguments

- `<handle>` - Your Bluesky handle (e.g., `alice.bsky.social`)
- `[key]` - (Optional) The private key (in hex format) for the new rotation key.
  If not provided, a new keypair will be generated.
- `--pds` - (Optional) Custom PDS server URL. Defaults to `https://bsky.social`
- `--format`, `-f` - (Optional) Output format for the generated keypair: `json`
  (default), `hex`, or `jwk`.
- `--remove`, `-rm` - (Optional) Remove the given rotation key.
  Pass the public key in multikey format (e.g., `did:key:z...`) or just
  the key part (e.g., `z...`).


#### Example: Add a key

Generate a new keypair and add it as a rotation key:

```sh
at rotation alice.bsky.social
```

This will:
1. Generate a new secp256k1 keypair
2. Log in and request email verification
3. Add the new public key to your DID document's `rotationKeys`
4. Print the new private key (save this securely!)

You can also provide an existing private key in hex format:

```
at rotation alice.bsky.social <private-key-hex>
```

#### Example: Remove a key

Remove an existing rotation key from your account:

```sh
at rotation alice.bsky.social --remove "did:key:zQ3sh..."
```

You can also pass just the key part:

```sh
at rotation alice.bsky.social --remove "zQ3sh..."
```

This command will:
1. Log in and request email verification
2. Fetch the current rotation keys from the PLC directory
3. Remove the specified key from the list
4. Update your DID with the new list of rotation keys


## How it works

The AT Protocol uses [DID (Decentralized Identifier)](https://atproto.com/specs/did)
documents as user identity. Each DID can include an
`alsoKnownAs` field that links to other identifiers or URLs.

This uses the
[@atproto/api](https://www.npmjs.com/package/@atproto/api) client.
