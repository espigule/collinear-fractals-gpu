# Release Process

This project distributes source through GitHub. Package-registry publication
is a separate action from a GitHub release or Pages deployment.

## Version discipline

The current release metadata is `0.2.0-alpha`. Keep fixes under `Unreleased`
until a new release is actually prepared. Use semantic prerelease versions
such as `0.2.1-alpha.1`; do not retag an existing version to a different commit.

When preparing a release, update `VERSION`, package manifests and lockfile,
`CITATION.cff`, browser/export metadata, example/figure metadata, and release
notes consistently. A software citation must identify the released revision;
do not attach an archival DOI until that archive exists.

## Quality gate

Follow [VALIDATION.md](VALIDATION.md), including the real-browser test suite
and schema checks. Review the resulting static artifact and record unexecuted
native ports. A locally passing check does not replace the CI result for the
revision being published.

Pages must publish only the staged allowlisted `site/` artifact after the
quality workflow passes. It must not publish the repository root, developer
reports, runtime caches, or unreviewed source materials.

## Review and release

1. Prepare a focused pull request with the problem, resulting behavior,
   compatibility implications, and validation evidence.
2. Wait for checks on the candidate revision and review the staged explorer.
3. Merge according to the repository's review rules; confirm checks for the
   resulting default-branch revision before release publication.
4. Create an annotated version tag and a GitHub prerelease for an alpha/beta.
   Keep release notes tied to the tagged revision.
5. Verify the public explorer and source links after publication.

A change to docs or numerical validation does not itself require a version
bump or registry publication. Preserve the existing public version until a
release is deliberately made.

## Artifacts

Keep caches, scratch certificates, generated archives, and large render dumps
out of git. Curated example search records may be versioned after schema and
numerical review. Generated release bundles and checksums belong in the
release assets; GitHub's source archives are sufficient for ordinary source
downloads. Store figure provenance next to any curated asset.
