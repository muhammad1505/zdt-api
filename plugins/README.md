# ZDT API Plugins

Letakkan file `.py` di direktori ini untuk plugin.
Setiap plugin harus memiliki class yang mewarisi `PluginBase`.

Contoh `hello_plugin.py`:

```python
from plugin_system import PluginBase

class HelloPlugin(PluginBase):
    name = 'hello'
    version = '1.0.0'
    description = 'Example plugin'
    hooks = ['startup', 'task_complete']

    def on_startup(self):
        print("Hello from plugin!")

    def on_task_complete(self, task):
        print(f"Task done: {task.get('id')}")
```
