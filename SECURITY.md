# Security reporting

Report vulnerabilities privately to **[hello@kraven.io](mailto:hello@kraven.io)**. Use a subject such as "Kraven Video Studio security report". Send the affected version, a concise description and synthetic reproduction instructions. Do not attach credentials, private transcripts or client footage. The maintainer mailbox exists; this preparation does not claim a test message was sent or a response SLA.

If the repository later enables GitHub private vulnerability reporting, its Security → Report a vulnerability option is an additional channel. Public release does not depend on creating that option first. Do not open exploit details in a public issue.

The installer uses pinned checksums and rejects archive traversal/links. It executes tools with the user's rights. Keep backups and follow organizational policy; do not bypass checksum, TLS, antivirus or driver restrictions. Reruns back up local configuration and preserve unknown settings; known tool paths/backend are regenerated. Malformed/future-schema or concurrently changed configuration is refused.

Remotion Studio is a local development tool. `pnpm dev` forces every new Node TCP listener in Studio's process tree onto loopback, including Studio itself, webpack lazy compilation and listeners that mix TCP and IPC options. Do not expose it with a proxy, port forward or direct `remotion studio` launch; a direct launch bypasses the guard and listens on every interface. The guard does not reach a child started with a replaced environment, non-Node programs, UDP sockets, or a handle or descriptor bound elsewhere. Repeat the complete listener audit after any Remotion, webpack or Node.js upgrade.

Claude handles its own account login; never put credentials in this repo. Local reviewer metadata is a claim, not identity verification or human consent. Reports are accepted for the latest candidate; no long-term support period is promised yet.
