# Examples (CLI)

These JSON files are safe-to-share example inputs for the CLI.

Run from `fidesdpp/`:

```bash
npm run cli -- create-vc --json examples/passport.example.json --account "" --key-type sr25519 --issuer-did localhost%3A3000 --json-output
```

Update example:

```bash
npm run cli -- update --token-id <TOKEN_ID> --json examples/passport.update.example.json --account "" --key-type sr25519
```

