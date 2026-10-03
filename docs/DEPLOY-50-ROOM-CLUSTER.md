# 50-room cluster deployment

Use 3 active SFU nodes and keep one spare node if possible.

## Application server

Set `SFU_BRIDGE_URLS` to all active SFU websocket endpoints. The application keeps a persistent bridge to every node, polls `/health`, pins each classroom to one healthy node, and sends all later media requests from that classroom to the same node.

Selection is load-aware: active room count is the strongest factor, then participant count and node load average.

## SFU nodes

Each SFU node runs the same `media-server/server.js` with a unique `SFU_NODE_ID` and unique routable `ANNOUNCED_IP`.

Recommended starting point per node:
- 8 logical CPU or more
- 24-32 GB RAM
- 1 Gbps dedicated uplink minimum
- `MEDIASOUP_WORKERS=8`
- `MAX_ROOMS_PER_WORKER=8`
- UDP/TCP ports 50990-51005 open
- TURN 3478 UDP/TCP and 5349 TLS when used

## Failover

If a node disconnects, its room/client mappings are dropped. Connected users receive `media:reconnect-required`; the next join selects another healthy node. Attendance/chat/session state remains in the application/database, not in the SFU.

## Capacity policy

- target: 50 rooms
- configured room ceiling: 60
- expected users: ~1000
- configured peer ceiling: 1500
- low bandwidth clients: 240p/360p
- normal gallery: 360p/480p
- pinned/active speaker: up to 720p
- student camera default off for lecture profile

Run synthetic 50-room load testing before declaring production acceptance. A single 1 Gbps server should not be treated as guaranteed 50-room capacity because outbound media bandwidth can become the bottleneck before CPU/RAM.