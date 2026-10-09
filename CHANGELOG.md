# Changelog

All notable changes to Jobwatch. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/kabartay/jobwatch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kabartay/jobwatch/releases/tag/v0.1.0
