# Troubleshooting

Start with **Jobwatch: Show Log**. It records where the token came from (never the token), which
account is watched, a line whenever the totals change, and every alert raised.

## "Jobwatch: no token"

No token in `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`, `HF_TOKEN_PATH`, `$HF_HOME/token` or
`~/.cache/huggingface/token`. Run `hf auth login`, then **Jobwatch: Refresh Jobs**. VS Code
started from the Dock does not see variables exported in a shell profile, so the token file is
the reliable route.

## "Hugging Face refused the token"

The token is revoked, expired or lacks permission to read jobs. Create a new one with read
access and log in again.

## The numbers look too low

The tooltip says how many jobs this month have no end time. Hugging Face records none for a
cancelled job; Jobwatch fills it in only for jobs it saw running, and shows the most the others
could have cost. The invoice is the authority.

## An organisation's jobs are missing

Jobwatch watches the token's own account unless `jobwatch.namespace` names another.

## A warning icon on the status bar

The last refresh failed and the numbers shown are from the time in the tooltip. A rate limit
pauses refreshes for at least five minutes.
