import os
import sys

CONFIG_FILE = None

class ZdtConfig:
    """Read configuration from config.env and zdt-modules."""
    
    def __init__(self):
        self.project_root = self._find_project_root()
        self.config_path = os.path.join(self.project_root, 'config.env')
        self.version_path = os.path.join(self.project_root, 'VERSION')
        self.modules_dir = os.path.join(self.project_root, 'zdt-modules')
        self._config = {}
        self._load_config()
        self._ensure_vpn_defaults()
        self._setup_modules_path()
    
    def _find_project_root(self):
        """Find the project root by looking for config.env."""
        # Try relative to this file
        path = os.path.dirname(os.path.abspath(__file__))
        for _ in range(5):
            if os.path.exists(os.path.join(path, 'config.env')):
                return path
            path = os.path.dirname(path)
        # Fallback: assume we're in zdt-api/, parent is project root
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    def _load_config(self):
        """Load key=value pairs from config.env."""
        global CONFIG_FILE
        CONFIG_FILE = self.config_path
        self._config = {}
        if not os.path.exists(self.config_path):
            return
        try:
            os.chmod(self.config_path, 0o600)
        except Exception:
            pass
        with open(self.config_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    self._config[key.strip()] = val.strip().strip('"').strip("'")
    
    def _setup_modules_path(self):
        """Add zdt-modules to Python path if needed."""
        if os.path.exists(self.modules_dir) and self.modules_dir not in sys.path:
            sys.path.insert(0, self.modules_dir)
    
    def _ensure_vpn_defaults(self):
        """Populate VPN defaults in config.env if missing."""
        defaults = {
            'VPN_SERVER': 'remote4.vpnmurahjogja.my.id',
            'VPN_USERNAME': 'gemini',
            'VPN_AUTOSTART': 'false',
        }
        changed = False
        for key, val in defaults.items():
            if key not in self._config:
                self._config[key] = val
                changed = True
        if changed:
            lines = []
            if os.path.exists(self.config_path):
                with open(self.config_path) as f:
                    lines = f.readlines()
            for key, val in defaults.items():
                if any(l.startswith(f'{key}=') for l in lines):
                    continue
                lines.append(f'{key}={val}\n')
            with open(self.config_path, 'w') as f:
                f.writelines(lines)
            os.chmod(self.config_path, 0o600)

    def get(self, key, default=None):
        return self._config.get(key, default)
    
    def get_version(self):
        """Read version - prioritize zdt-api/VERSION, then config.env, then parent VERSION."""
        # Check zdt-api's own VERSION file first
        my_dir = os.path.dirname(os.path.abspath(__file__))
        my_version = os.path.join(my_dir, 'VERSION')
        if os.path.exists(my_version):
            with open(my_version) as f:
                return f.read().strip()
        # Check config
        version = self.get('ZDT_VERSION')
        if version:
            return version
        # Fallback to parent project VERSION
        if os.path.exists(self.version_path):
            with open(self.version_path) as f:
                return f.read().strip()
        return '0.0.0'
    
    def get_target_dir(self):
        return self.get('TARGET_DIR', os.path.expanduser('~/Music/ZDT_Downloads'))
    
    def get_web_pass(self):
        return self.get('ZDT_WEB_PASS', 'admin')
    
    def get_web_user(self):
        return self.get('ZDT_WEB_USER', 'admin')
    
    def get_telegram_config(self):
        return {
            'bot_token': self.get('TELEGRAM_BOT_TOKEN', ''),
            'chat_id': self.get('TELEGRAM_CHAT_ID', ''),
        }
    
    def update_config(self, key, value):
        """Update a config value and write to file."""
        self._config[key] = value
        lines = []
        found = False
        if os.path.exists(self.config_path):
            with open(self.config_path) as f:
                for line in f:
                    if line.startswith(f'{key}='):
                        lines.append(f'{key}={value}\n')
                        found = True
                    else:
                        lines.append(line)
        if not found:
            lines.append(f'{key}={value}\n')
        with open(self.config_path, 'w') as f:
            f.writelines(lines)
        os.chmod(self.config_path, 0o600)


config = ZdtConfig()
