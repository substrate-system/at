# at

A typescript/node CLI client for [at protocol](https://atproto.com/) (bluesky).

This exposes a CLI tool, `at`, that you can use to make requests to
your [DID document](https://atproto.com/specs/did).

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Use](#use)
  * [`aka` command](#aka-command)
  * [Example](#example)
  * [Using a custom PDS](#using-a-custom-pds)
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


### Example

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

### Using a custom PDS

Pass in the `--pds` argument with PDS URL.

```sh
at aka alice.example.com https://alice.com --pds https://pds.example.com
```

## How it works

The AT Protocol uses [DID (Decentralized Identifier)](https://atproto.com/specs/did)
documents as user identity. Each DID can include an
`alsoKnownAs` field that links to other identifiers or URLs.

This uses the
[@atproto/api](https://www.npmjs.com/package/@atproto/api) client.
