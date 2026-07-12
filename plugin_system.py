import os
import sys
import json
import importlib
import inspect
import threading
import logging
from typing import Optional

logger = logging.getLogger('zdt-api.plugins')

PLUGINS_DIR = None


class PluginBase:
    name = ''
    version = '1.0.0'
    description = ''
    author = ''
    hooks: list[str] = []

    def on_load(self):
        pass

    def on_unload(self):
        pass

    def on_task_complete(self, task: dict):
        pass

    def on_task_fail(self, task: dict):
        pass

    def on_download_complete(self, filepath: str, url: str):
        pass

    def on_startup(self):
        pass


_plugins: dict[str, PluginBase] = {}
_hooks: dict[str, list[tuple[str, str]]] = {}
_plugin_lock = threading.Lock()


def set_plugins_dir(path: str):
    global PLUGINS_DIR
    PLUGINS_DIR = path
    if PLUGINS_DIR not in sys.path:
        sys.path.insert(0, PLUGINS_DIR)


def discover() -> list[dict]:
    if not PLUGINS_DIR or not os.path.isdir(PLUGINS_DIR):
        return []
    plugins = []
    for f in sorted(os.listdir(PLUGINS_DIR)):
        if f.endswith('.py') and not f.startswith('_'):
            name = f[:-3]
            manifest_path = os.path.join(PLUGINS_DIR, name + '.json')
            manifest = {}
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path) as mf:
                        manifest = json.load(mf)
                except Exception:
                    pass
            info = {
                'name': manifest.get('name', name),
                'version': manifest.get('version', '1.0.0'),
                'description': manifest.get('description', ''),
                'author': manifest.get('author', ''),
                'file': f,
                'loaded': name in _plugins,
            }
            plugins.append(info)
    return plugins


def load(name: str) -> bool:
    if not PLUGINS_DIR:
        return False
    with _plugin_lock:
        if name in _plugins:
            return True
        try:
            spec = importlib.util.spec_from_file_location(name, os.path.join(PLUGINS_DIR, name + '.py'))
            if not spec or not spec.loader:
                return False
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for _, cls in inspect.getmembers(mod, inspect.isclass):
                if issubclass(cls, PluginBase) and cls is not PluginBase:
                    instance = cls()
                    instance.on_load()
                    _plugins[name] = instance
                    for hook in instance.hooks:
                        if hook not in _hooks:
                            _hooks[hook] = []
                        _hooks[hook].append((name, hook))
                    logger.info(f"Plugin loaded: {name} v{instance.version}")
                    return True
            logger.warning(f"No PluginBase subclass found in {name}")
            return False
        except Exception as e:
            logger.error(f"Failed to load plugin {name}: {e}")
            return False


def unload(name: str) -> bool:
    with _plugin_lock:
        plugin = _plugins.pop(name, None)
        if not plugin:
            return False
        plugin.on_unload()
        for hook in list(_hooks.keys()):
            _hooks[hook] = [(p, h) for p, h in _hooks[hook] if p != name]
            if not _hooks[hook]:
                del _hooks[hook]
        logger.info(f"Plugin unloaded: {name}")
        return True


def load_all():
    for info in discover():
        if not info['loaded']:
            load(info['name'])


def trigger(event: str, **kwargs):
    with _plugin_lock:
        handlers = list(_hooks.get(event, []))
    for plugin_name, hook in handlers:
        plugin = _plugins.get(plugin_name)
        if plugin:
            try:
                method = getattr(plugin, f'on_{event}', None)
                if method:
                    method(**kwargs)
            except Exception as e:
                logger.error(f"Plugin {plugin_name} hook {event} error: {e}")
