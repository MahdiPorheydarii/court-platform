# Shared-host resource policy

Compose limits each service to one CPU, 512 MiB memory (768 MiB for Praxis storage),
and 256 PIDs. Logs rotate at 10 MiB, three files. These are protective ceilings,
not reservations. Existing network, health, volume and application settings remain
as defined by the application. Monitor OOM/restart counters and adjust with actual
load evidence before larger traffic or datasets.

These values live in docker-compose.yml and survive the next Dokploy Git deployment.
The initial operational change applied equivalent live container limits without
restarting the apps. Avoid concurrent builds/rollouts on the shared two-CPU host.
Do not execute contestant code or builds on this production control server.
