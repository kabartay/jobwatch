# Security

## The token

Read from `HF_TOKEN` (or `HUGGING_FACE_HUB_TOKEN`), else from the file the `hf` CLI writes. It
is sent as a bearer token to `huggingface.co` only: a next-page link to any other host is never
followed. It is never written, logged or shown; the log names only where it came from.

## What is requested

| Request | Why |
| --- | --- |
| `GET /api/whoami-v2` | The account name, once per token, unless `jobwatch.namespace` is set |
| `GET /api/jobs/{namespace}` | The job list, page by page |
| `GET /api/jobs/hardware` | Prices, at most every six hours |

Nothing else, and nothing that changes a job.

## What is read from a job

Its id, label, owner, hardware flavour, stage and message, timestamps, running time and time
limit. A job's `environment`, `secrets`, command and the single-job record's `hfToken` are never
read.

## What is stored

In VS Code's extension storage: the keys of alerts already shown, and when each job was last
seen running. No job content, no token.

## Reporting a problem

Open an issue at [kabartay/jobwatch](https://github.com/kabartay/jobwatch/issues), or use GitHub's
private vulnerability reporting for anything sensitive.
