import threading
import json
import time
import logging
from typing import Callable

logger = logging.getLogger('zdt-api.events')

class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[Callable]] = {}
        self._lock = threading.Lock()

    def subscribe(self, event_type: str, callback: Callable):
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            self._subscribers[event_type].append(callback)

    def unsubscribe(self, event_type: str, callback: Callable):
        with self._lock:
            if event_type in self._subscribers:
                self._subscribers[event_type] = [cb for cb in self._subscribers[event_type] if cb != callback]

    def emit(self, event_type: str, data: dict):
        with self._lock:
            callbacks = list(self._subscribers.get(event_type, []))
        for cb in callbacks:
            try:
                cb({'type': event_type, 'data': data, 'timestamp': time.time()})
            except Exception as e:
                logger.error(f"Event callback error: {e}")

    def emit_task_update(self, task: dict):
        self.emit('task_update', task)


_event_bus = EventBus()


class SSEManager:
    def __init__(self):
        self._clients: list[callable] = []
        self._lock = threading.Lock()

    def add_client(self, send_fn: Callable):
        with self._lock:
            self._clients.append(send_fn)

    def remove_client(self, send_fn: Callable):
        with self._lock:
            self._clients = [c for c in self._clients if c != send_fn]

    def broadcast(self, event_type: str, data: dict):
        msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        with self._lock:
            clients = list(self._clients)
        dead = []
        for send_fn in clients:
            try:
                send_fn(msg)
            except Exception:
                dead.append(send_fn)
        if dead:
            with self._lock:
                self._clients = [c for c in self._clients if c not in dead]


_sse_manager = SSEManager()


def get_event_bus() -> EventBus:
    return _event_bus


def get_sse_manager() -> SSEManager:
    return _sse_manager


def task_update_listener(event: dict):
    _sse_manager.broadcast('task_update', event['data'])


def init_events():
    _event_bus.subscribe('task_update', task_update_listener)
    logger.info("Event system initialized")
