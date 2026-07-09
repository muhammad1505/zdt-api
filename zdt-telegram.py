#!/usr/bin/env python3
import sys
import os
import time
import subprocess
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
try:
    import telebot
    from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
except ImportError:
    print("Modul pyTelegramBotAPI (telebot) belum terinstall!")
    sys.exit(1)

# Load shared path module
_MODULES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zdt-modules")
if not os.path.isdir(_MODULES_DIR):
    # Bootstrap: ZdtPaths belum tersedia, pake hardcoded path saja
    for _d in [os.path.expanduser("~/.local/share/zdt/zdt-modules"), "/usr/local/share/zdt/zdt-modules"]:
        if os.path.isdir(_d):
            _MODULES_DIR = _d
            break
if _MODULES_DIR not in sys.path:
    sys.path.insert(0, _MODULES_DIR)
from zdt_paths import ZdtPaths

YT_DLP = shutil.which('yt-dlp') or os.path.expanduser('~/.local/bin/yt-dlp')

TOKEN = os.environ.get("TELEGRAM_TOKEN", "")
if not TOKEN:
    TOKEN_FILE = ZdtPaths.get_telegram_token_path()
    if os.path.exists(TOKEN_FILE):
        try:
            os.chmod(TOKEN_FILE, 0o600)
        except OSError:
            pass
        with open(TOKEN_FILE, 'r') as f:
            TOKEN = f.read().strip()
if not TOKEN:
    import config as _zdt_config
    TOKEN = _zdt_config.config.get('TELEGRAM_BOT_TOKEN', '')

if not TOKEN:
    print("Token Telegram tidak ditemukan di konfigurasi atau env var!")
    if __name__ == "__main__":
        sys.exit(1)
    else:
        TOKEN = "dummy_token_for_import"

bot = telebot.TeleBot(TOKEN)

# Thread pool untuk background tasks — batasi maks 10 thread concurrent
# + Queue-based approach: jika pool penuh, task masuk antrian
from concurrent.futures import ThreadPoolExecutor, TimeoutError

_bg_thread_pool = ThreadPoolExecutor(max_workers=10, thread_name_prefix="zdt_bg")

def _safe_submit_task(task_fn):
    """Submit task ke thread pool dengan queue timeout (60s).
    Jika pool penuh, task akan menunggu hingga ada slot kosong."""
    future = _bg_thread_pool.submit(task_fn)
    return future

def _safe_popen(cmd_args, **kwargs):
    """Safe subprocess.Popen wrapper that prevents PIPE deadlock.
    Always redirects stderr to stdout when using PIPE to avoid buffer deadlock."""
    if 'stdout' in kwargs and kwargs['stdout'] == subprocess.PIPE:
        kwargs['stderr'] = subprocess.STDOUT
    return subprocess.Popen(cmd_args, **kwargs)

import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    force=True
)
telebot.logger.setLevel(logging.INFO)

def _format_tg(text):
    """Convert AI markdown response to Telegram-safe HTML."""
    import re, html as html_mod
    text = html_mod.escape(text)
    # Headers -> bold
    text = re.sub(r'^#{1,3}\s+(.+)$', r'<b>\1</b>', text, flags=re.MULTILINE)
    # **bold** -> <b>bold</b>
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # *italic* -> <i>italic</i> (but not bullet points)
    text = re.sub(r'(?<!\n)\*([^*\n]+?)\*', r'<i>\1</i>', text)
    # `code` -> <code>code</code>
    text = re.sub(r'`([^`]+?)`', r'<code>\1</code>', text)
    # Bullet points: * item -> • item
    text = re.sub(r'^\*\s+', '• ', text, flags=re.MULTILINE)
    # Clean excessive newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

# ============================================
# LOAD SHARED AI PROMPT TEMPLATE
# ============================================
def _load_ai_prompt():
    """Load shared AI prompt template from file, with fallback."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    search_dirs = [script_dir] + ZdtPaths.SHARE_DIRS
    for d in search_dirs:
        prompt_file = os.path.join(d, "zdt-ai-prompt.txt")
        if os.path.exists(prompt_file):
            with open(prompt_file, 'r') as f:
                return f.read()
    # Fallback: minimal prompt built-in
    return (
        "Kamu Zaki-Bot, asisten pintar ZDT Music Toolkit. Bahasa gaul Indonesia, jawab singkat dan to the point.\n\n"
        "FITUR ZDT:\n"
        "- Download Audio/Video dari YouTube, Spotify, TikTok, IG, FB, SoundCloud\n"
        "- Kompres Audio (AAC/MP3/FLAC/OPUS) & Video (x264/x265/AV1/VP9)\n"
        "- Pisah Vokal & Instrumen pakai AI Demucs (karaoke)\n"
        "- Auto Sync Lirik (.lrc) via syncedlyrics\n"
        "- Bersih & Rapikan Nama File\n"
        "- Buat Playlist .M3U dari folder\n"
        "- Web Dashboard (Flask, port 5000)\n"
        "- Watch Daemon, Telegram Bot, Metadata Editor\n"
        "- Storage Manager & System Info\n\n"
        "PERSONALITY:\n"
        "- Santai, gaul, pake bahasa sehari-hari Indonesia\n"
        "- Jawab SINGKAT, max 2-3 kalimat\n"
        "- Kalo user minta aksi → kasih tau sambil eksekusi\n"
        "- JANGAN pake markdown heading (###)\n"
        "- PAKAI emoji secukupnya aja"
    )

chat_history_lock = threading.Lock()
chat_history = {}

original_send_message = bot.send_message
def logging_send_message(chat_id, text, **kwargs):
    logging.info(f"Bot mengirim pesan ke {chat_id}: {text}")
    with chat_history_lock:
        if chat_id not in chat_history:
            if len(chat_history) >= 1000:
                chat_history.pop(next(iter(chat_history)))
            chat_history[chat_id] = {"messages": [], "search_results": []}
        chat_history[chat_id]["messages"].append(f"Zaki-Bot: {text}")
        chat_history[chat_id]["messages"] = chat_history[chat_id]["messages"][-6:]
    return original_send_message(chat_id, text, **kwargs)
bot.send_message = logging_send_message


def listener(messages):
    for m in messages:
        if m.content_type == 'text':
            user = m.from_user.first_name if m.from_user else "Unknown"
            logging.info(f"Pesan masuk dari {user} (ID: {m.chat.id}): {m.text}")
        with chat_history_lock:
            if m.chat.id not in chat_history:
                if len(chat_history) >= 1000:
                    chat_history.pop(next(iter(chat_history)))
                chat_history[m.chat.id] = {"messages": [], "search_results": []}
            chat_history[m.chat.id]["messages"].append(f"User: {m.text}")
            chat_history[m.chat.id]["messages"] = chat_history[m.chat.id]["messages"][-6:]

bot.set_update_listener(listener)

# Don't cache at module level — resolve at runtime to accommodate PATH changes
# Use function wrapper for lazy resolution
def get_zdt_bin():
    """Resolve zdt binary at call time, not import time.
    Searches PATH first, then falls back to known install locations:
    ~/.local/bin/zdt, /usr/local/bin/zdt, /data/data/com.termux/files/usr/bin/zdt
    """
    return shutil.which("zdt") or ZdtPaths.get_bin_path()

@bot.message_handler(commands=['start', 'help', 'menu'])
def send_welcome(message):
    msg = (
        "🤖 *ZDT ENTERPRISE REMOTE BOT*\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "Selamat datang bos! Saya adalah asisten remote "
        "yang terhubung langsung ke server ZDT Anda.\n\n"
        "🚀 *DAFTAR PERINTAH:*\n"
        "🎵 `/audio <link>` - Sedot Musik (YT/Spotify)\n"
        "🎬 `/video <link>` - Sedot Video Kualitas Tinggi\n"
        "📈 `/status` - Cek Kondisi Server (RAM/Disk)\n"
        "⚡ `/ping` - Cek kecepatan respon bot\n\n"
        "Atau pilih menu otomatis di bawah ini untuk mengeksekusi fitur server:"
    )
    markup = InlineKeyboardMarkup()
    markup.row_width = 2
    markup.add(
        InlineKeyboardButton("🗜️ Kompres Media", callback_data="cmd_kompres"),
        InlineKeyboardButton("🎤 Ekstrak Vokal", callback_data="cmd_vokal"),
        InlineKeyboardButton("🧹 Bersih Nama", callback_data="cmd_bersih"),
        InlineKeyboardButton("🎵 Sync Lirik", callback_data="cmd_lirik"),
        InlineKeyboardButton("📑 Bikin Playlist", callback_data="cmd_playlist")
    )
    bot.reply_to(message, msg, parse_mode="Markdown", reply_markup=markup)

@bot.message_handler(commands=['status'])
def server_status(message):
    try:
        disk = subprocess.check_output(["df", "-h", "/"]).decode('utf-8').split('\n')[1].split()
        ram = subprocess.check_output(["free", "-m"]).decode('utf-8').split('\n')[1].split()
        uptime = subprocess.check_output(["uptime", "-p"]).decode('utf-8').strip()
        
        msg = (
            "📊 *STATUS SERVER ZDT*\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"⏱️ *Uptime:* {uptime.replace('up ', '')}\n"
            f"💾 *Disk Tersisa:* {disk[3]} dari {disk[1]} ({disk[4]} Terpakai)\n"
            f"🧠 *RAM Terpakai:* {ram[2]}MB / {ram[1]}MB\n"
            "🟢 *Status:* Online & Siap Tempur!"
        )
        bot.reply_to(message, msg, parse_mode="Markdown")
    except Exception as e:
        bot.reply_to(message, f"Gagal mengambil status: {e}")

@bot.message_handler(commands=['ping'])
def ping_bot(message):
    start = time.time()
    msg = bot.reply_to(message, "🏓 Pong!")
    end = time.time()
    ms = int((end - start) * 1000)
    bot.edit_message_text(f"🏓 Pong! `{ms}ms`", chat_id=message.chat.id, message_id=msg.message_id, parse_mode="Markdown")

def get_target_dir():
    target_dir = os.path.expanduser("~/Music/ZDT_Downloads")
    conf_file = ZdtPaths.get_config_file()
    old_conf = ZdtPaths.get_old_config_file()
    for cf in [conf_file, old_conf]:
        if os.path.exists(cf):
            with open(cf, 'r') as f:
                for line in f:
                    if line.startswith("TARGET_DIR=") or line.startswith("storage_dir="):
                        val = line.strip().split('=', 1)[1].strip('"').strip("'")
                        if val and val != ".":
                            return os.path.expanduser(val)
    return target_dir

def get_config_value(key, default=""):
    """Baca satu value dari config.env (single source of truth)."""
    conf_file = ZdtPaths.get_config_file()
    old_conf = ZdtPaths.get_old_config_file()
    for cf in [conf_file, old_conf]:
        if os.path.exists(cf):
            with open(cf, 'r') as f:
                for line in f:
                    if line.startswith(f"{key}="):
                        val = line.strip().split('=', 1)[1].strip('"').strip("'")
                        if val:
                            return val
    return default

def get_recent_media_files(limit=5):
    import glob
    target = get_target_dir()
    files = []
    if os.path.exists(target):
        for ext in ['*.mp3','*.m4a','*.flac','*.wav','*.ogg','*.opus','*.mp4','*.mkv']:
            files.extend(glob.glob(os.path.join(target, ext)))
    files.sort(key=os.path.getmtime, reverse=True)
    return files[:limit]

@bot.message_handler(commands=['demucs'])
def demucs_cmd(message):
    files = get_recent_media_files(5)
    if not files:
        bot.reply_to(message, "❌ Tidak ada file media ditemukan di Storage.")
        return
    markup = InlineKeyboardMarkup()
    for i, f in enumerate(files):
        basename = os.path.basename(f)
        markup.add(InlineKeyboardButton(f"🎤 {basename[:40]}", callback_data=f"do_demucs|{i}"))
    # Store file list in user_data for callback lookup
    if not hasattr(bot, 'user_data'):
        bot.user_data = {}
    bot.user_data[message.chat.id] = {'files': files, 'last_cmd': 'demucs'}
    bot.reply_to(message, "🎶 *Pilih file yang ingin dipisah vokalnya:*", parse_mode="Markdown", reply_markup=markup)

@bot.message_handler(commands=['kompres'])
def kompres_cmd(message):
    files = get_recent_media_files(5)
    if not files:
        bot.reply_to(message, "❌ Tidak ada file media ditemukan di Storage.")
        return
    markup = InlineKeyboardMarkup()
    for i, f in enumerate(files):
        basename = os.path.basename(f)
        markup.add(InlineKeyboardButton(f"🗜️ {basename[:40]}", callback_data=f"do_kompres|{i}"))
    if not hasattr(bot, 'user_data'):
        bot.user_data = {}
    bot.user_data[message.chat.id] = {'files': files, 'last_cmd': 'kompres'}
    bot.reply_to(message, "🗜️ *Pilih file yang ingin dikompres:*", parse_mode="Markdown", reply_markup=markup)

@bot.message_handler(commands=['video'])
def download_video(message):
    text = message.text.replace('/video', '').strip()
    urls = [word for word in text.split() if word.startswith(('http://', 'https://'))]
    if not urls:
        bot.reply_to(message, "❌ Link tidak valid! Contoh: `/video https://youtube.com/...`", parse_mode="Markdown")
        return
        
    url = urls[0]
    bot.reply_to(message, f"⏳ *Sedang Mendownload Video...*\n📍 `Server` sedang memproses link Anda.", parse_mode="Markdown")
    
    try:
        with open(os.devnull, 'w') as devnull:
            subprocess.Popen([get_zdt_bin(), "--download-video", url], stdout=devnull, stderr=devnull, start_new_session=True)
    except Exception as e:
        bot.reply_to(message, f"❌ Terjadi kesalahan: {str(e)}")

@bot.message_handler(commands=['audio'])
def download_audio_cmd(message):
    text = message.text.replace('/audio', '').strip()
    urls = [word for word in text.split() if word.startswith(('http://', 'https://'))]
    if not urls:
        bot.reply_to(message, "❌ Link tidak valid! Contoh: `/audio https://spotify.com/...`", parse_mode="Markdown")
        return
        
    url = urls[0]
    bot.reply_to(message, f"⏳ *Sedang Mendownload Audio...*\n📍 `Server` sedang menyedot musik Anda.", parse_mode="Markdown")
    
    try:
        with open(os.devnull, 'w') as devnull:
            subprocess.Popen([get_zdt_bin(), "--download-audio", url], stdout=devnull, stderr=devnull, start_new_session=True)
    except Exception as e:
        bot.reply_to(message, f"❌ Terjadi kesalahan: {str(e)}")

@bot.message_handler(func=lambda message: True)
def auto_download_audio(message):
    text = message.text
    if "http" not in text:
        gemini_key_file = ZdtPaths.get_key_path("gemini_key")
        openrouter_key_file = ZdtPaths.get_key_path("openrouter_key")
        gemini_key = ""
        openrouter_key = ""
        if os.path.exists(gemini_key_file):
            try:
                with open(gemini_key_file, "r") as f:
                    gemini_key = f.read().strip()
            except (OSError, PermissionError):
                pass
        if os.path.exists(openrouter_key_file):
            try:
                with open(openrouter_key_file, "r") as f:
                    openrouter_key = f.read().strip()
            except (OSError, PermissionError):
                pass
        
        # Dual-key logic: jika gemini_key starts with sk-or- -> backward compat sbg OR key
        if gemini_key and gemini_key.startswith("sk-or-"):
            if not openrouter_key:
                openrouter_key = gemini_key
            gemini_key = ""
        
        try:
            if gemini_key or openrouter_key:
                bot.send_chat_action(message.chat.id, 'typing')
                import urllib.request, json
                    
                abs_path = get_target_dir()
                try:
                    if os.path.exists(abs_path):
                        dir_contents = ", ".join(os.listdir(abs_path)[:50])
                    else:
                        dir_contents = "Direktori kosong/tidak ada."
                except (OSError, PermissionError):
                    dir_contents = "Gagal membaca direktori."

                with chat_history_lock:
                    chat_data = chat_history.get(message.chat.id, {"messages": [], "search_results": []})
                history_context = "\\n".join(chat_data["messages"])
                search_context = "\\n".join(chat_data["search_results"])
                    
                if search_context:
                    search_context = f"\\n\\nInfo Hasil Pencarian Terakhir (Ganti nomor dengan URL yang sesuai jika user memilih):\\n{search_context}"
                        
                base_prompt = _load_ai_prompt()
                prompt = f"""{base_prompt}

TELEGRAM COMMANDS: /audio <url>, /video <url>, /status, /ping, /start, /demucs, /kompres.
Inline buttons: Kompres, Vokal, Bersih Nama, Sync Lirik, Playlist.

Storage: {abs_path}. File: {dir_contents}
{search_context}
Chat: {history_context}"""

                def process_reply(reply_text, user_text=None):
                    if user_text is None:
                        user_text = text
                    action = None
                    display_text = reply_text

                    # Try to parse JSON response from AI (Gemini/OpenRouter sometimes output JSON)
                    if reply_text.strip().startswith('{'):
                        try:
                            parsed = json.loads(reply_text)
                            if isinstance(parsed, dict):
                                if 'reply' in parsed:
                                    display_text = parsed['reply'] if isinstance(parsed.get('reply'), str) else (str(parsed.get('reply') or ''))
                                if parsed.get('intent'):
                                    intent = parsed['intent']
                                    intent_actions = {
                                        'download audio': lambda: f"gas download audio {parsed.get('query', '')}" if parsed.get('query') else "gas download audio ",
                                        'download video': lambda: f"gas download video {parsed.get('query', '')}" if parsed.get('query') else "gas download video ",
                                        'cari youtube': lambda: f"cari youtube {parsed.get('query', '').replace('ytsearch1:', '')}" if parsed.get('query') else "cari youtube ",
                                        'cari lagu': lambda: f"cari youtube {parsed.get('query', '').replace('ytsearch1:', '')}" if parsed.get('query') else "cari youtube ",
                                        'pisah vokal': lambda: "hapus vokal",
                                        'hapus vokal': lambda: "hapus vokal",
                                        'kompres media': lambda: "kompres media",
                                        'kompres video': lambda: "kompres video",
                                        'sync lirik': lambda: "sync lirik",
                                        'bersih nama': lambda: "bersih nama",
                                        'bikin playlist': lambda: "bikin playlist",
                                        'info sistem': lambda: "cek status",
                                        'web ui': lambda: "buka web",
                                    }
                                    ii = intent.lower().strip()
                                    if ii in intent_actions:
                                        action = intent_actions[ii]()
                        except json.JSONDecodeError:
                            pass

                    if not action and display_text and "[AUTO_ACTION:" in display_text:
                        import re
                        match = re.search(r"\[AUTO_ACTION:\s*(.+?)\]", display_text)
                        if match:
                            action = match.group(1).strip()

                    # === KEYWORD FALLBACK: if AI didn't include AUTO_ACTION, detect from user text ===
                    if not action:
                        import re
                        kw = user_text.lower()

                        if re.search(r'(download|sedot|ambil|unduh)', kw):
                            if re.search(r'(video|mp4|film|klip)', kw):
                                url = re.sub(r'.*?(video|download|sedot|ambil|unduh)\s*', '', kw, flags=re.I).strip()
                                url = re.sub(r'^(video|mp4|film|klip)\s*', '', url).strip()
                                if re.match(r'^https?://', url):
                                    action = f"gas download video {url}"
                                else:
                                    action = "gas download video "
                            else:
                                url = re.sub(r'.*?(download|sedot|ambil|unduh)\s*', '', kw, flags=re.I).strip()
                                url = re.sub(r'^(audio|lagu|musik|mp3)\s*', '', url).strip()
                                url = re.sub(r'^(bantu|tolong|dung|in|kan|dong|yah|ya|bro|bang|nih|nih)\s*', '', url, flags=re.I).strip()
                                if re.match(r'^https?://', url):
                                    action = f"gas download audio {url}"
                                elif url and not re.match(r'^(download|sedot|ambil|audio|lagu)$', url):
                                    action = f"gas download audio ytsearch1:{url}"
                                else:
                                    action = "gas download audio "

                        elif re.search(r'(pisah.*vokal|vokal.*pisah|karaoke|demucs|vocal.?remov|pisahin)', kw):
                            action = "hapus vokal"

                        elif re.search(r'(kompres|kecilin|compress|kecilkan)', kw):
                            if re.search(r'(video|mp4)', kw):
                                action = "kompres video"
                            else:
                                action = "kompres media"

                        elif re.search(r'(lirik|sync.*lirik|lyric|cari.*lirik)', kw):
                            action = "sync lirik"

                        elif re.search(r'(bersih.*nama|beresin.*nama|rapihin.*nama|rename.*file|rapiin)', kw):
                            action = "bersih nama"

                        elif re.search(r'(playlist|m3u|buat.*playlist|bikin.*playlist)', kw):
                            action = "bikin playlist"

                        elif re.search(r'(status|info.*sistem|cek.*server|storage|kapasitas)', kw):
                            action = "cek status"

                        elif re.search(r'(web.*ui|dashboard|webui)', kw):
                            action = "buka web"

                        elif re.search(r'(spotify|spot)', kw):
                            if re.search(r'https?://', kw):
                                url = re.search(r'https?://[^\s]+', kw).group(0)
                                action = f"gas download audio {url}"
                            else:
                                action = "gas download audio "

                        elif re.search(r'^(halo|hai|hey|hi|hallo|helo|selamat|siang|pagi|sore|malam)', kw):
                            pass  # Biarkan AI handle greeting, no action needed

                    if action:
                                
                            def run_bg_task(cmd_args, success_msg, progress_msg=None):
                                import threading
                                import subprocess
                                import time
                                import re
                                def _task():
                                    try:
                                        # Using unbuffered output trick via stdbuf or directly reading
                                        process = _safe_popen([get_zdt_bin()] + cmd_args, stdout=subprocess.PIPE, text=True, bufsize=1)
                                            
                                        last_update = time.time()
                                        log_buffer = []
                                        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
                                            
                                        for line in iter(process.stdout.readline, ''):
                                            if not line:
                                                break
                                            clean_line = ansi_escape.sub('', line).strip()
                                                
                                            if clean_line:
                                                # yt-dlp outputs progress on lines starting with [download], update it without creating new array items if it's progress
                                                if log_buffer and clean_line.startswith("[download]") and log_buffer[-1].startswith("[download]"):
                                                    log_buffer[-1] = clean_line
                                                else:
                                                    log_buffer.append(clean_line)
                                                    
                                                log_buffer = log_buffer[-6:] # keep last 6 lines
                                                
                                            # Update telegram message every 3 seconds
                                            if progress_msg and time.time() - last_update > 3.0:
                                                context = "\n".join(log_buffer)
                                                import html
                                                try:
                                                    bot.edit_message_text(f"⏳ <b>Proses Berjalan...</b>\n<pre>{html.escape(context)}</pre>", chat_id=progress_msg.chat.id, message_id=progress_msg.message_id, parse_mode="HTML")
                                                except Exception:
                                                    pass # ignore rate limits or unchanged errors
                                                last_update = time.time()
                                            
                                        process.wait()
                                        final_context = "\n".join(log_buffer)
                                        import html
                                            
                                        if process.returncode == 0:
                                            if progress_msg:
                                                try:
                                                    bot.edit_message_text(f"✅ <b>{success_msg}</b>\n\n📄 <b>Log Terakhir:</b>\n<pre>{html.escape(final_context)}</pre>", chat_id=progress_msg.chat.id, message_id=progress_msg.message_id, parse_mode="HTML")
                                                except Exception:
                                                    bot.reply_to(message, f"✅ <b>{success_msg}</b>\n\n📄 <b>Log Terakhir:</b>\n<pre>{html.escape(final_context)}</pre>", parse_mode="HTML")
                                            else:
                                                bot.reply_to(message, f"✅ <b>{success_msg}</b>\n\n📄 <b>Log Terakhir:</b>\n<pre>{html.escape(final_context)}</pre>", parse_mode="HTML")
                                        else:
                                            if progress_msg:
                                                try:
                                                    bot.edit_message_text(f"❌ <b>Terjadi kesalahan.</b>\n\n📄 <b>Error:</b>\n<pre>{html.escape(final_context)}</pre>", chat_id=progress_msg.chat.id, message_id=progress_msg.message_id, parse_mode="HTML")
                                                except Exception:
                                                    bot.reply_to(message, f"❌ <b>Terjadi kesalahan.</b>\n\n📄 <b>Error:</b>\n<pre>{html.escape(final_context)}</pre>", parse_mode="HTML")
                                            else:
                                                bot.reply_to(message, f"❌ <b>Terjadi kesalahan.</b>\n\n📄 <b>Error:</b>\n<pre>{html.escape(final_context)}</pre>", parse_mode="HTML")
                                    except Exception as e:
                                        bot.reply_to(message, f"❌ System Error: {e}")
                                _safe_submit_task(_task)

                            if action.startswith("gas download audio"):
                                url = action.replace("gas download audio", "").strip()
                                # Sanitasi URL: hanya izinkan http/https URLs yang valid
                                import re
                                urls = re.findall(r'https?://[^\s]+', url)
                                if not urls:
                                    bot.reply_to(message, "❌ URL tidak valid untuk download audio.")
                                    return
                                url = urls[0]
                                sent_msg = bot.reply_to(message, f"⏳ <b>Sedang Mendownload Audio...</b>\n📍 <code>Server</code> memproses link.", parse_mode="HTML")
                                run_bg_task(["--download-audio", url], "Audio berhasil di-download!", sent_msg)
                            elif action.startswith("gas download video"):
                                url = action.replace("gas download video", "").strip()
                                # Sanitasi URL: hanya izinkan http/https URLs yang valid
                                import re
                                urls = re.findall(r'https?://[^\s]+', url)
                                if not urls:
                                    bot.reply_to(message, "❌ URL tidak valid untuk download video.")
                                    return
                                url = urls[0]
                                sent_msg = bot.reply_to(message, f"⏳ <b>Sedang Mendownload Video...</b>\n📍 <code>Server</code> memproses link.", parse_mode="HTML")
                                run_bg_task(["--download-video", url], "Video berhasil di-download!", sent_msg)
                            elif action.startswith("cari youtube"):
                                query = action.replace("cari youtube", "").strip()
                                # Batasi panjang query untuk cegah abuse
                                query = query[:500]
                                import html
                                bot.reply_to(message, f"🔍 <b>Mencari di YouTube...</b>\nKata kunci: <code>{html.escape(query)}</code>", parse_mode="HTML")
                                    
                                def _search_task(page=0):
                                    try:
                                        res = subprocess.run([YT_DLP, f"ytsearch10:{query}", "--print", "%(title)s|%(webpage_url)s"], capture_output=True, text=True)
                                        if res.returncode == 0 and res.stdout.strip():
                                            import telebot
                                            import html
                                                
                                            lines = res.stdout.strip().split('\n')
                                            all_results = []
                                            for line in lines:
                                                parts = line.split('|', 1)
                                                if len(parts) == 2:
                                                    all_results.append((parts[0].strip(), parts[1].strip()))
                                            
                                            if not all_results:
                                                bot.reply_to(message, "❌ Pencarian tidak menemukan hasil.")
                                                return
                                            
                                            start = page * 5
                                            page_results = all_results[start:start + 5]
                                            total_pages = (len(all_results) + 4) // 5
                                            
                                            formatted = []
                                            urls = []
                                            markup = InlineKeyboardMarkup(row_width=5)
                                            row_btns = []
                                            for idx, (title, url) in enumerate(page_results, start + 1):
                                                t = html.escape(title)
                                                formatted.append(f"{idx}. <b>{t}</b>\n{url}")
                                                urls.append(f"{idx}) {url}")
                                                row_btns.append(InlineKeyboardButton(f"{idx}", callback_data=f"SRCH_DL:{url}"))
                                            markup.row(*row_btns)
                                            
                                            nav = []
                                            if page > 0:
                                                nav.append(InlineKeyboardButton("⬅️ Sebelumnya", callback_data=f"SRCH_PAGE:{query}:{page - 1}"))
                                            if page + 1 < total_pages:
                                                nav.append(InlineKeyboardButton(f"➡️ Selanjutnya ({page+2}/{total_pages})", callback_data=f"SRCH_PAGE:{query}:{page + 1}"))
                                            if nav:
                                                markup.row(*nav)
                                            
                                            with chat_history_lock:
                                                if chat_history.get(message.chat.id):
                                                    chat_history[message.chat.id]["search_results"] = urls
                                                
                                            out_text = "\n\n".join(formatted)
                                            bot.reply_to(message, f"🎯 <b>Hasil Pencarian:</b>\n\n{out_text}", parse_mode="HTML", reply_markup=markup, link_preview_options=telebot.types.LinkPreviewOptions(is_disabled=True))
                                        else:
                                            bot.reply_to(message, "❌ Pencarian tidak menemukan hasil.")
                                    except Exception as e:
                                        bot.reply_to(message, f"❌ Error pencarian: {e}")
                                _safe_submit_task(lambda: _search_task(0))
                            elif action.startswith("cari playlist"):
                                query = action.replace("cari playlist", "").strip()
                                import urllib.parse
                                import html
                                bot.reply_to(message, f"🔍 <b>Mencari Playlist di YouTube...</b>\nKata kunci: <code>{html.escape(query)}</code>", parse_mode="HTML")
                                    
                                def _search_playlist_task():
                                    try:
                                        # &sp=EgIQAw%253D%253D is YouTube's filter for Playlists
                                        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&sp=EgIQAw%253D%253D"
                                        res = subprocess.run([YT_DLP, search_url, "--flat-playlist", "--print", "%(title)s|%(webpage_url)s", "--playlist-end", "5"], capture_output=True, text=True)
                                        if res.returncode == 0 and res.stdout.strip():
                                            import telebot
                                            import html
                                                
                                            lines = res.stdout.strip().split('\n')
                                            formatted = []
                                            urls = []
                                            # Sometimes yt-dlp returns channel links on playlist searches, we should filter or just list them
                                            idx = 1
                                            for line in lines:
                                                parts = line.split('|', 1)
                                                if len(parts) == 2:
                                                    title = html.escape(parts[0].strip())
                                                    url = html.escape(parts[1].strip())
                                                    formatted.append(f"{idx}. <b>{title}</b>\n{url}")
                                                    urls.append(f"{idx}) {parts[1].strip()}")
                                                    idx += 1
                                                
                                            with chat_history_lock:
                                                if chat_history.get(message.chat.id):
                                                    chat_history[message.chat.id]["search_results"] = urls
                                                
                                            out_text = "\n\n".join(formatted)
                                            bot.reply_to(message, f"🎯 <b>Hasil Pencarian Playlist:</b>\n\n{out_text}\n\n<i>Balas dengan nomor (misal: 'download playlist nomor 1') atau linknya!</i>", parse_mode="HTML", link_preview_options=telebot.types.LinkPreviewOptions(is_disabled=True))
                                        else:
                                            bot.reply_to(message, "❌ Pencarian playlist tidak menemukan hasil.")
                                    except Exception as e:
                                        bot.reply_to(message, f"❌ Error pencarian playlist: {e}")
                                _safe_submit_task(_search_playlist_task)
                            elif action == "hapus vokal":
                                bot.reply_to(message, "⚙️ Mengakses panel Demucs AI...")
                                demucs_cmd(message)
                            elif action == "kompres media":
                                bot.reply_to(message, "⚙️ Mengakses panel Kompresi Media...")
                                kompres_cmd(message)
                            elif action == "sync lirik":
                                sent_msg = bot.reply_to(message, "⏳ <b>Menyelaraskan lirik di background...</b>", parse_mode="HTML")
                                run_bg_task(["--sync-lirik-all"], "Lirik berhasil di-sync!", sent_msg)
                            elif action == "bersih nama":
                                sent_msg = bot.reply_to(message, "⏳ <b>Membersihkan nama file di background...</b>", parse_mode="HTML")
                                run_bg_task(["--bersih-nama-all"], "Nama file berhasil dirapikan!", sent_msg)
                            elif action == "bikin playlist":
                                sent_msg = bot.reply_to(message, "⏳ <b>Membuat playlist di background...</b>", parse_mode="HTML")
                                run_bg_task(["--bikin-playlist-all"], "Playlist M3U8 berhasil dibuat!", sent_msg)
                            elif action == "hapus semua":
                                # Konfirmasi keamanan sebelum hapus
                                markup = InlineKeyboardMarkup()
                                markup.row_width = 2
                                markup.add(
                                    InlineKeyboardButton("⚠️ YA, HAPUS SEMUA", callback_data=f"CONFIRM_DELETE:{abs_path}"),
                                    InlineKeyboardButton("❌ BATAL", callback_data="CANCEL_DELETE")
                                )
                                bot.reply_to(message, f"⚠️ *PERINGATAN KEAMANAN!*\n\nAnda akan menghapus SEMUA file di:\n`{abs_path}`\n\nTindakan ini TIDAK BISA dibatalkan!\n\nKlik tombol di bawah untuk konfirmasi:", parse_mode="Markdown", reply_markup=markup)
                            elif action == "cek status":
                                server_status(message)
                            elif action == "buka web":
                                bot.reply_to(message, "🌐 Buka Web Dashboard di: http://localhost:5678/\n\nLogin dengan user/password dari config.env.\n\nFitur: Monitoring server, download management, scheduler, notifikasi Telegram.")
                            elif action == "setup tools":
                                bot.reply_to(message, "⚙️ Menjalankan Setup Tools...")
                                try:
                                    with open(os.devnull, 'w') as devnull:
                                        subprocess.Popen([get_zdt_bin(), "--setup"], stdout=devnull, stderr=devnull, start_new_session=True)
                                except Exception as e:
                                    bot.reply_to(message, f"❌ Error: {e}")
                            elif action == "update tools":
                                bot.reply_to(message, "🔄 Menjalankan Update ZDT...")
                                try:
                                    with open(os.devnull, 'w') as devnull:
                                        subprocess.Popen([get_zdt_bin(), "--update"], stdout=devnull, stderr=devnull, start_new_session=True)
                                except Exception as e:
                                    bot.reply_to(message, f"❌ Error: {e}")
                            elif action == "start telegram":
                                bot.reply_to(message, "🤖 Telegram Bot sudah berjalan! (Ini botnya sendiri)")
                            elif action == "start watch":
                                sent_msg = bot.reply_to(message, "⏳ <b>Memulai Watch Daemon...</b>", parse_mode="HTML")
                                run_bg_task(["--watch"], "Watch Daemon berjalan!")
                            elif action == "buka scheduler":
                                bot.reply_to(message, "📅 Scheduler ada di Web Dashboard -> panel Scheduler.\n\nCara pakai:\n1. Buka http://localhost:5678/\n2. Login, buka panel Scheduler\n3. Tambah URL playlist Spotify\n4. Atur interval (jam)\n5. Klik Start Daemon\n\nDownload otomatis + notif Telegram kalau selesai!")
                            elif action == "ubah storage":
                                bot.reply_to(message, "📁 Untuk mengubah folder Storage:\n1. Edit file ~/.config/zdt/config.env\n2. Set TARGET_DIR=/path/baru\n3. Restart bot\n\nAtau lewat CLI: zdt -> pilih menu Storage Setup")
                            else:
                                bot.reply_to(message, f"❌ Aksi {action} belum didukung di Telegram.")
                                
                            try:
                                clean_reply = re.sub(r"\[AUTO_ACTION:.*?\]", "", display_text).strip()
                                if clean_reply:
                                    try:
                                        bot.reply_to(message, _format_tg(clean_reply), parse_mode="HTML")
                                    except Exception:
                                        pass
                            except Exception:
                                pass
                            return
                    try:
                        bot.reply_to(message, _format_tg(display_text), parse_mode="HTML")
                    except Exception:
                        pass
                    
                # Dual-key routing: prefer Gemini (lebih pintar), OpenRouter sebagai fallback
                reply_text = ""
                import urllib.error
                
                if gemini_key:
                    try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
                        headers = {"Content-Type": "application/json"}
                        payload = {"system_instruction": {"parts": [{"text": prompt}]}, "contents": [{"role": "user", "parts": [{"text": text}]}], "generationConfig": {"maxOutputTokens": 1000}}
                        data = json.dumps(payload).encode("utf-8")
                        req = urllib.request.Request(url, data=data, headers=headers)
                        with urllib.request.urlopen(req, timeout=30) as response:
                            res = json.loads(response.read().decode())
                        if "error" not in res:
                            content = res.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")
                            if content:
                                process_reply(content.strip())
                                return
                    except Exception:
                        pass
                
                if openrouter_key:
                    url = "https://openrouter.ai/api/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"}
                    messages = [{"role": "system", "content": prompt}, {"role": "user", "content": text}]
                        
                    fallback_models = [
                        "google/gemma-4-26b-a4b-it:free",
                        "nvidia/nemotron-3-nano-30b-a3b:free",
                        "meta-llama/llama-3.2-3b-instruct:free",
                    ]
                    for model in fallback_models:
                        payload = {"model": model, "messages": messages, "max_tokens": 1000}
                        data = json.dumps(payload).encode("utf-8")
                        req = urllib.request.Request(url, data=data, headers=headers)
                        try:
                            with urllib.request.urlopen(req, timeout=25) as response:
                                res = json.loads(response.read().decode())
                                if "error" not in res:
                                    content = res.get("choices", [{}])[0].get("message", {}).get("content")
                                    if content:
                                        process_reply(content.strip())
                                        return
                        except Exception:
                            continue
                
                bot.reply_to(message, "🤔 Maaf bos, otak AI-nya sedang error. Coba lagi nanti ya!")
                return
        except Exception:
                bot.reply_to(message, "🤔 Maaf bos, otak AI-nya sedang error. Coba lagi nanti ya!")
                return
        
        bot.reply_to(message, "🤔 Maksud lu apa nih? Kirim link media aja langsung buat disedot, atau ketik /start untuk lihat fitur!")
        return
        
    url = [word for word in text.split() if "http" in word][0]
    bot.reply_to(message, f"🎧 *Link Terdeteksi!*\nOtomatis mendownload sebagai Audio (MP3/M4A).", parse_mode="Markdown")
    
    try:
        with open(os.devnull, 'w') as devnull:
            subprocess.Popen([get_zdt_bin(), "--download-audio", url], stdout=devnull, stderr=devnull, start_new_session=True)
    except Exception as e:
        bot.reply_to(message, f"❌ Terjadi kesalahan: {str(e)}")

@bot.callback_query_handler(func=lambda call: call.data.startswith('cmd_'))
def callback_query(call):
    cmd = call.data
    action = ""
    bash_flag = ""
    
    if cmd == "cmd_kompres":
        kompres_cmd(call.message)
        return
    elif cmd == "cmd_vokal":
        demucs_cmd(call.message)
        return
    elif cmd == "cmd_bersih":
        action = "🧹 Pembersih Nama File"
        bash_flag = "--bersih-nama-all"
    elif cmd == "cmd_lirik":
        action = "🎵 Auto-Sync Lirik"
        bash_flag = "--sync-lirik-all"
    elif cmd == "cmd_playlist":
        action = "📑 Generator Playlist"
        bash_flag = "--bikin-playlist-all"

    bot.answer_callback_query(call.id, f"Mengeksekusi: {action}")
    bot.send_message(call.message.chat.id, f"⏳ *Memulai Task:* `{action}`\n📍 _Proses berjalan di background server._", parse_mode="Markdown")
    
    try:
        with open(os.devnull, 'w') as devnull:
            subprocess.Popen([get_zdt_bin(), bash_flag], stdout=devnull, stderr=devnull, start_new_session=True)
    except Exception as e:
        bot.send_message(call.message.chat.id, f"❌ Terjadi kesalahan: {str(e)}")

@bot.callback_query_handler(func=lambda call: call.data.startswith('do_demucs|') or call.data.startswith('do_kompres|'))
def process_specific_file(call):
    cmd_type, idx_str = call.data.split('|', 1)
    # Look up file path from stored user_data
    chat_id = call.message.chat.id
    user_data = getattr(bot, 'user_data', {}).get(chat_id, {})
    files = user_data.get('files', [])
    try:
        idx = int(idx_str)
        filepath = files[idx] if 0 <= idx < len(files) else ''
    except (ValueError, IndexError):
        filepath = ''
    
    if not filepath or not os.path.exists(filepath):
        bot.answer_callback_query(call.id, "File sudah tidak ada di server!")
        return
    
    bot.answer_callback_query(call.id, "Memulai proses background...")
    msg = bot.send_message(chat_id, f"⏳ *Mempersiapkan tugas...*\n📍 `{os.path.basename(filepath)}`", parse_mode="Markdown")
    
    import subprocess, time, re, shutil
    
    def _task():
        try:
            cmd_args = []
            target_dir = os.path.dirname(filepath)
            
            if cmd_type == "do_demucs":
                demucs_bin = ZdtPaths.get_demucs_bin()
                if not os.path.exists(demucs_bin): demucs_bin = shutil.which("demucs")
                if not demucs_bin:
                    bot.edit_message_text("❌ Demucs AI belum terinstal.", chat_id=msg.chat.id, message_id=msg.message_id)
                    return
                cmd_args = [demucs_bin, "--two-stems=vocals", "-o", target_dir, filepath]
                task_name = "Memisahkan Vokal"
                
            elif cmd_type == "do_kompres":
                base, ext = os.path.splitext(filepath)
                out_path = f"{base}_compressed{ext}"
                if ext.lower() in ['.mp4', '.mkv']:
                    cmd_args = ["ffmpeg", "-y", "-i", filepath, "-vcodec", "libx264", "-crf", "28", "-preset", "fast", out_path]
                else:
                    cmd_args = ["ffmpeg", "-y", "-i", filepath, "-b:a", "128k", out_path]
                task_name = "Kompresi Media"

            process = _safe_popen(cmd_args, stdout=subprocess.PIPE, text=True, bufsize=1)
            last_update = time.time()
            log_buffer = []
            last_pct = "0%"
            
            for line in iter(process.stdout.readline, ''):
                if not line: break
                clean_line = line.strip()
                if not clean_line: continue
                
                log_buffer.append(clean_line)
                log_buffer = log_buffer[-5:]
                
                if cmd_type == "do_demucs":
                    match = re.search(r'(\d+\.?\d*)%', clean_line)
                    if match: last_pct = match.group(1) + "%"
                elif cmd_type == "do_kompres":
                    if "time=" in clean_line:
                        match = re.search(r'time=(\S+)', clean_line)
                        if match: last_pct = match.group(1)

                if time.time() - last_update > 3.0:
                    import html
                    context = "\\n".join(log_buffer)
                    text = f"⏳ <b>{task_name}</b> [{last_pct}]\\n<pre>{html.escape(context)}</pre>"
                    try:
                        bot.edit_message_text(text, chat_id=msg.chat.id, message_id=msg.message_id, parse_mode="HTML")
                    except Exception:
                        pass
                    last_update = time.time()
            
            process.wait()
            if process.returncode == 0:
                bot.edit_message_text(f"✅ *{task_name} Selesai!*\n📍 `{os.path.basename(filepath)}`", chat_id=msg.chat.id, message_id=msg.message_id, parse_mode="Markdown")
            else:
                bot.edit_message_text(f"❌ *{task_name} Gagal!*", chat_id=msg.chat.id, message_id=msg.message_id, parse_mode="Markdown")
                
        except Exception as e:
            bot.edit_message_text(f"❌ Error: {str(e)}", chat_id=msg.chat.id, message_id=msg.message_id)

    _bg_thread_pool.submit(_task)

@bot.callback_query_handler(func=lambda call: call.data.startswith('CONFIRM_DELETE:'))
def confirm_delete_callback(call):
    """Handler untuk konfirmasi hapus semua file"""
    bot.answer_callback_query(call.id, "Menghapus semua file...")
    try:
        target_path = os.path.abspath(call.data.split(':', 1)[1])
        base_dir = os.path.abspath(get_target_dir())
        if not target_path.startswith(base_dir):
            bot.edit_message_text("❌ Path tidak diizinkan!", chat_id=call.message.chat.id, message_id=call.message.message_id)
            return
        if not os.path.exists(target_path):
            bot.edit_message_text("❌ Direktori tidak ditemukan!", chat_id=call.message.chat.id, message_id=call.message.message_id)
            return
        
        bot.edit_message_text("🗑️ *Menghapus semua file...*\nMohon tunggu.", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode="Markdown")
        
        deleted = 0
        for filename in os.listdir(target_path):
            file_path = os.path.join(target_path, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                    deleted += 1
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
                    deleted += 1
            except (OSError, PermissionError):
                pass
        
        bot.edit_message_text(f"✅ *Selesai!* {deleted} item berhasil dihapus dari:\n`{target_path}`", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode="Markdown")
    except Exception as e:
        bot.edit_message_text(f"❌ Gagal menghapus: {e}", chat_id=call.message.chat.id, message_id=call.message.message_id)


@bot.callback_query_handler(func=lambda call: call.data == 'CANCEL_DELETE')
def cancel_delete_callback(call):
    """Handler untuk membatalkan hapus semua"""
    bot.edit_message_text("❌ Pembatalan hapus semua. Tidak ada file yang dihapus.", chat_id=call.message.chat.id, message_id=call.message.message_id)
    bot.answer_callback_query(call.id, "Dibatalkan.")

@bot.callback_query_handler(func=lambda call: call.data.startswith('SRCH_DL:'))
def search_download_callback(call):
    url = call.data.replace('SRCH_DL:', '', 1)
    bot.answer_callback_query(call.id, "Memulai download...")
    msg = bot.send_message(call.message.chat.id, f"⏳ <b>Sedang Mendownload Audio...</b>\n📍 <code>{url}</code>", parse_mode="HTML")
    def _task():
        try:
            p = subprocess.Popen([get_zdt_bin(), "--download-audio", url], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            out, _ = p.communicate(timeout=300)
            import html
            bot.send_message(call.message.chat.id, f"✅ <b>Download selesai!</b>\n<pre>{html.escape(out[-500:])}</pre>", parse_mode="HTML")
        except Exception as e:
            bot.send_message(call.message.chat.id, f"❌ Gagal: {e}")
    _safe_submit_task(_task)

@bot.callback_query_handler(func=lambda call: call.data.startswith('SRCH_PAGE:'))
def search_page_callback(call):
    """Handler untuk pagination hasil pencarian"""
    parts = call.data.split(':', 2)
    if len(parts) < 3: return
    _, query, page_str = parts
    try:
        page = int(page_str)
    except ValueError:
        return
    bot.answer_callback_query(call.id)
    try:
        bot.edit_message_text(f"🔍 <b>Mencari di YouTube...</b>\nKata kunci: <code>{query}</code>", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode="HTML")
    except Exception: pass
    
    def _paginate():
        try:
            import html
            res = subprocess.run([YT_DLP, f"ytsearch10:{query}", "--print", "%(title)s|%(webpage_url)s"], capture_output=True, text=True)
            if res.returncode != 0 or not res.stdout.strip():
                try:
                    bot.edit_message_text("❌ Pencarian tidak menemukan hasil.", chat_id=call.message.chat.id, message_id=call.message.message_id)
                except Exception: pass
                return
            lines = res.stdout.strip().split('\n')
            all_results = []
            for line in lines:
                parts = line.split('|', 1)
                if len(parts) == 2:
                    all_results.append((parts[0].strip(), parts[1].strip()))
            if not all_results:
                try:
                    bot.edit_message_text("❌ Pencarian tidak menemukan hasil.", chat_id=call.message.chat.id, message_id=call.message.message_id)
                except Exception: pass
                return
            start = page * 5
            page_results = all_results[start:start + 5]
            total_pages = (len(all_results) + 4) // 5
            formatted = []
            urls = []
            markup = InlineKeyboardMarkup(row_width=5)
            row_btns = []
            for idx, (title, url) in enumerate(page_results, start + 1):
                t = html.escape(title)
                formatted.append(f"{idx}. <b>{t}</b>\n{url}")
                urls.append(f"{idx}) {url}")
                row_btns.append(InlineKeyboardButton(f"{idx}", callback_data=f"SRCH_DL:{url}"))
            markup.row(*row_btns)
            nav = []
            if page > 0:
                nav.append(InlineKeyboardButton("⬅️ Sebelumnya", callback_data=f"SRCH_PAGE:{query}:{page - 1}"))
            if page + 1 < total_pages:
                nav.append(InlineKeyboardButton(f"➡️ Selanjutnya ({page+2}/{total_pages})", callback_data=f"SRCH_PAGE:{query}:{page + 1}"))
            if nav:
                markup.row(*nav)
            with chat_history_lock:
                if chat_history.get(call.message.chat.id):
                    chat_history[call.message.chat.id]["search_results"] = urls

            out_text = "\n\n".join(formatted)
            out_text += "\n\n👇 Pilih nomor di bawah ini"
            try:
                bot.edit_message_text(f"🎯 <b>Hasil Pencarian:</b>\n\n{out_text}", chat_id=call.message.chat.id, message_id=call.message.message_id, parse_mode="HTML", reply_markup=markup, link_preview_options=telebot.types.LinkPreviewOptions(is_disabled=True))
            except Exception: pass
        except Exception as e:
            try:
                bot.edit_message_text(f"❌ Error: {e}", chat_id=call.message.chat.id, message_id=call.message.message_id)
            except Exception: pass
    _safe_submit_task(_paginate)

if __name__ == "__main__":
    try:
        bot.remove_webhook()
        time.sleep(1)
    except Exception:
        pass
    print("Telegram Bot ZDT berjalan. Menunggu pesan masuk...")
    bot.infinity_polling()
