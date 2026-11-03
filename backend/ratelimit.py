"""Small in-process sliding-window rate limiter keyed by verified user id.

This protects the API (and the GitHub/Gemini quotas behind it) from a single
account hammering expensive endpoints. It is per process: when running several
instances behind a load balancer, put a shared limiter (e.g. Redis or the
hosting platform's rate limiting) in front as well.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException


class RateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] > window_seconds:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, round(window_seconds - (now - events[0])))
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many requests. Please wait about {retry_after} second(s) and try again.",
                    headers={"Retry-After": str(retry_after)},
                )
            events.append(now)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


limiter = RateLimiter()
