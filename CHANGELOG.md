# Changelog

All notable changes to Jobwatch. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] — 2026-10-09

### Changed

- The README describes Jobwatch as what it is, a Hugging Face Jobs extension, without a roadmap
  of other services. No change in behaviour.

## [0.1.1] — 2026-10-09

### Changed

- A cancelled job with no end time now shows `no end time · up to $4.00`, the most it could
  have cost from its time limit, instead of a blank, in both the job picker and the tooltip. A
  cost taken from Jobwatch's own sighting is marked `≥` as the lower bound it is.
- The README shows what Jobwatch looks like, the wording of each alert, and how cost is
  estimated in each case.

### Added

- Citation metadata (`CITATION.cff`, `.zenodo.json`) for archiving on Zenodo; neither ships in
  the extension package.

## [0.1.0] — 2026-10-09

The first version: Hugging Face Jobs.

### Added

- A status bar item showing running and queued jobs with the estimated cost so far, or this
  month's estimated spend when nothing is active; a tooltip listing each job's hardware, running
  time and cost.
- Notifications, each shown once: a failure (an out-of-memory kill named as such), a completion,
  a job within minutes of its own timeout, a job waiting too long for hardware, and a monthly
  budget passed. Jobs that finished before installation are recorded, not announced.
- Cost estimated from running time and Hugging Face's own per-minute price list. A cancelled
  job's end time, which Hugging Face does not record, is taken from the last time Jobwatch saw it
  running; jobs it never saw are bounded by their time limits instead.
- Pagination through the full job list, adaptive polling (every minute while active, every ten
  minutes otherwise) and back-off on rate limits.
- **Jobwatch: Refresh Jobs**, **Jobwatch: Open a Job…** and **Jobwatch: Show Log**.

[Unreleased]: https://github.com/kabartay/jobwatch/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/kabartay/jobwatch/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kabartay/jobwatch/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kabartay/jobwatch/releases/tag/v0.1.0
