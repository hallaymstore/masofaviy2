# 50 parallel live-room architecture

Target load: 50 concurrent groups, about 20 students per group, roughly 1000 concurrent participants.

## Load distribution rules

1. A room is always pinned to one SFU node for its lifetime. Never split one classroom across nodes unless inter-SFU piping is deliberately introduced.
2. The platform chooses the least-loaded healthy SFU node when a room is first created.
3. Inside that node, mediasoup chooses the least-loaded worker. Current branch limits each worker to 8 rooms and balances by room count first, peer count second.
4. One room uses only the resources it needs. With 1 room, only one router is active. With 3 rooms, routers spread over available workers. With 50 rooms, rooms are distributed across workers/nodes.
5. Keep 20% capacity headroom: 50-room target, 60-room configured ceiling, 1500-peer ceiling.

## Recommended production topology

- Application/API: 1 primary + optional standby.
- MongoDB: separate database/service from MD project.
- SFU: 3 active nodes + 1 standby node.
- Each active SFU node: 8-16 logical CPU, 24-32 GB RAM, 1 Gbps minimum dedicated uplink.
- Better: 10 Gbps uplink if a single node must carry many rooms.
- TURN: at least 2 TURN endpoints or one redundant TURN service.
- Reverse proxy/LB: sticky room routing based on roomId.
- Shared registry: Redis is recommended for roomId -> sfuNode mapping and health/TTL data.

## Bandwidth policy

For 50 x 20 users, bandwidth is more important than RAM. Teacher video should use simulcast and adaptive subscription:
- low: 240p
- balanced: 360p/480p
- active speaker/pinned: 720p
- avoid forcing 720p to every participant.

Lecture-lite should keep student cameras off by default and limit simultaneously active student audio producers. This makes 1000 concurrent users realistic without exploding egress.

## Failover

- New rooms must never be assigned to a node whose CPU, packet loss, egress, worker count, or health endpoint is outside limits.
- Existing rooms stay pinned to their node.
- If a node dies, clients reconnect and the room is recreated on the next healthy node.
- The platform should keep room state/attendance/chat outside the SFU process so media failover does not lose academic state.

## Readiness thresholds

Production target is considered ready only when:
- targetParallelRooms >= 50
- maxActiveRooms >= 60
- maxTotalPeers >= 1000
- at least 8 mediasoup workers on a single large SFU node, or equivalent capacity distributed across nodes
- RTC TCP fallback enabled
- required UDP/TCP RTC ports reachable externally
- TURN reachable
- 50-room synthetic load test passes with acceptable CPU, memory, packet loss, and outbound bandwidth.