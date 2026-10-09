# Development

## Setup

```bash
git clone https://github.com/kabartay/jobwatch.git
cd jobwatch
npm install
```

Node 22 is what CI uses.

## Commands

| Command | Does |
| --- | --- |
| `npm run compile` | Builds `src/` into `out/` |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint with type-aware rules and the layer boundaries |
| `npm test` | Compiles, then runs every `out/test/**/*.test.js` with `node:test` |
| `npm run check` | All three: run before every commit |
| `npm run package` | Builds `jobwatch-<version>.vsix` |

Press **F5** in VS Code to run the extension in a development host.

## Tests

`src/test/` mirrors the layers. Domain and application tests are pure, with in-memory fakes;
the infrastructure tests run the HTTP client and the provider against a real local server,
including pagination, a next-page link to another host (never followed) and the token never
appearing in an error.

## Releasing

1. Bump `version` in `package.json` and move the `Unreleased` notes in `CHANGELOG.md` under it.
2. `npm run check`, commit, push, wait for CI.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`. The release workflow builds the `.vsix` and
   attaches it to a GitHub Release.
4. Replace the generated notes with written ones: unwrapped Markdown, one paragraph per line.
5. Upload the `.vsix` on the Marketplace publisher page (**···** → **Update**).

## Dependabot

Dependabot opens monthly PRs. Never merge them on GitHub; see `CLAUDE.md`.
