# Release Process

This project ships source-first GitHub releases. Registry publication to npm, PyPI, or other package indexes is intentionally deferred until the package metadata and CI history are mature.

## Release branches and versions

- Use semantic versioning with prerelease identifiers: `v0.1.0-alpha`,
  `v0.1.1-alpha`, `v0.2.0-alpha`, `v0.1.0-beta.1`, `v0.1.0`.
- Treat `v0.2.0-alpha` as the next candidate only when the staged Pages site,
  share URLs, curated example metadata, gallery index, schemas, and CI pass.
- Keep `VERSION`, `README.md`, `CHANGELOG.md`, `CITATION.cff`, browser metadata, and package manifests in sync.
- Use annotated tags for public releases.

## Required checks

Run these before tagging:

```bash
node --check explorer.js
node qa/explorer-prefix-smoke-test.js
cd javascript && npm test
cd ../python && python3 -m unittest -v test_collinear.py
cd ../swift && swift test
cd .. && python3 tools/validate_bundle.py
```

The GitHub Actions CI workflow must pass on `main` before publishing a non-draft release.

## Artifact policy

Keep generated archives, local certificates, scratch certificates, and large
figure outputs out of git. Curated example certificates and
`certificates/verified/*.json` are allowed when they are reviewed
reproducibility artifacts. Attach release bundles and checksum files to GitHub
Releases instead. The repository's automatic GitHub source archives are
acceptable for normal source downloads.

## Release checklist

1. Update release metadata and `CHANGELOG.md`.
2. Run the required checks locally when the runtimes are available.
3. Push to `main` and wait for CI.
4. Create an annotated tag, for example `git tag -a v0.1.0-alpha -m "v0.1.0-alpha"`.
5. Create a GitHub prerelease with release notes, checksums, and any generated source bundle.
6. Confirm GitHub Pages renders the explorer.
