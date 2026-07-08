        // ============================================
        // AUTH: Token management & fetch interceptor
        // ============================================
        let _authToken = localStorage.getItem('zdt_token') || '';
        let _isAuthenticated = false;

        // Override fetch to inject Bearer token
        const _origFetch = window.fetch;
        window.fetch = function(url, opts = {}) {
            opts = opts || {};
            opts.headers = opts.headers || {};
            if (_authToken && !opts.headers['Authorization']) {
                opts.headers['Authorization'] = 'Bearer ' + _authToken;
            }
            return _origFetch.call(window, url, opts);
        };

        // Check auth on page load
        async function checkAuth() {
            if (!_authToken) {
                showLogin();
                return;
            }
            try {
                const res = await fetch('/api/status');
                if (res.ok) {
                    _isAuthenticated = true;
                    hideLogin();
                } else if (res.status === 401 || res.status === 403) {
                    // Token expired or invalid
                    localStorage.removeItem('zdt_token');
                    _authToken = '';
                    showLogin();
                } else {
                    // Server error, maybe still show the page
                    _isAuthenticated = true;
                    hideLogin();
                }
            } catch(e) {
                // Network error — try to show anyway
                _isAuthenticated = true;
                hideLogin();
            }
        }

        function showLogin() {
            document.getElementById('loginOverlay').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        function hideLogin() {
            document.getElementById('loginOverlay').classList.add('hidden');
            document.body.style.overflow = '';
        }

        async function handleLogin(event) {
            event.preventDefault();
            // Clear old token before login attempt
            _authToken = '';
            const btn = document.getElementById('loginBtn');
            const errEl = document.getElementById('loginError');
            const user = document.getElementById('loginUser').value.trim();
            const pass = document.getElementById('loginPass').value;

            btn.disabled = true;
            btn.innerHTML = '<span class="login-spinner"></span> Signing in...';
            errEl.classList.remove('show');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: user, password: pass})
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    _authToken = data.token;
                    localStorage.setItem('zdt_token', data.token);
                    _isAuthenticated = true;
                    hideLogin();
                    // Reload data now that we're authenticated
                    loadStatus();
                    loadDbStats();
                    showToast('Login berhasil!', 'success');
                } else {
                    errEl.textContent = data.message || data.error || 'Login gagal!';
                    errEl.classList.add('show');
                }
            } catch(e) {
                errEl.textContent = 'Koneksi error: ' + e.message;
                errEl.classList.add('show');
            }

            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
            return false;
        }

        function logout() {
            _authToken = '';
            _isAuthenticated = false;
            localStorage.removeItem('zdt_token');
            showLogin();
            showToast('Logged out', 'info');
        }

        // Run auth check on load
        checkAuth();

        window.addEventListener("DOMContentLoaded", () => {
            // dlFormat selector removed — using auto-detect format
        });

        function switchTab(tabId, el) {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            if(el) el.classList.add('active');

            const titles = {
                'dashboard': ['Dashboard Overview', 'Monitor your storage and system resources'],
                'statistik': ['Statistik & Riwayat', 'Pantau aktivitas unduhan dan histori'],
                'downloader': ['Media Downloader', 'Download audio and video from various platforms'],
                'spotify': ['Spotify Synchronization', 'Keep your local library synced with Spotify'],
                'metadata': ['Metadata Editor', 'Fix missing album art and ID3 tags'],
                'servertools': ['Server Utility Tools', 'Batch process files directly on the server'],
                'logs': ['System Logs', 'System journal dan log troubleshooting'],
                'notifikasi': ['Notifikasi Telegram', 'Konfigurasi notifikasi otomatis ke Telegram'],
                'scheduler': ['Auto-Sync Scheduler', 'Jadwalkan sinkronisasi Spotify otomatis'],
                'system': ['System Daemons', 'Manage background automation services'],
                'settings': ['Global Settings', 'Configure ZDT core behaviors']
            };
            const t = titles[tabId];
            if (t) {
                document.getElementById('pageTitle').innerText = t[0];
                document.getElementById('pageSubtitle').innerText = t[1];
            }

            if(['metadata', 'servertools'].includes(tabId)) loadFiles();
            if(tabId === 'logs') loadSystemLogs();
            if(tabId === 'notifikasi') loadNotifConfig();
            if(tabId === 'scheduler') { loadSchedulerStatus(); loadScheduledPlaylists(); }
            if(tabId === 'statistik') loadDbStats();
        }

        let statsChartInstance = null;

        // Pagination state
        let _statsPage = 1;
        let _statsTotalPages = 1;

        function renderStatsPagination() {
            const pageNumbers = document.getElementById('statsPageNumbers');
            const prevBtn = document.getElementById('statsPrevBtn');
            const nextBtn = document.getElementById('statsNextBtn');
            const pageInfo = document.getElementById('statsPageInfo');

            pageInfo.textContent = `Halaman ${_statsPage} dari ${_statsTotalPages}`;
            prevBtn.disabled = _statsPage <= 1;
            nextBtn.disabled = _statsPage >= _statsTotalPages;

            prevBtn.style.opacity = _statsPage <= 1 ? '0.4' : '1';
            nextBtn.style.opacity = _statsPage >= _statsTotalPages ? '0.4' : '1';

            pageNumbers.innerHTML = '';
            const maxVisible = 7;
            let start = Math.max(1, _statsPage - Math.floor(maxVisible / 2));
            let end = Math.min(_statsTotalPages, start + maxVisible - 1);
            if (end - start < maxVisible - 1) {
                start = Math.max(1, end - maxVisible + 1);
            }

            if (start > 1) {
                pageNumbers.innerHTML += `<button class="btn btn-outline" style="width:auto; padding:4px 10px; font-size:11px;" onclick="changeStatsPage(1)">1</button>`;
                if (start > 2) pageNumbers.innerHTML += `<span style="color:var(--text-muted); font-size:12px; padding:0 2px;">...</span>`;
            }
            for (let i = start; i <= end; i++) {
                const active = i === _statsPage;
                pageNumbers.innerHTML += `<button class="btn ${active ? '' : 'btn-outline'}" style="width:auto; padding:4px 10px; font-size:11px; ${active ? 'background:var(--primary);' : ''}" onclick="changeStatsPage(${i})">${i}</button>`;
            }
            if (end < _statsTotalPages) {
                if (end < _statsTotalPages - 1) pageNumbers.innerHTML += `<span style="color:var(--text-muted); font-size:12px; padding:0 2px;">...</span>`;
                pageNumbers.innerHTML += `<button class="btn btn-outline" style="width:auto; padding:4px 10px; font-size:11px;" onclick="changeStatsPage(${_statsTotalPages})">${_statsTotalPages}</button>`;
            }
        }

        function changeStatsPage(dirOrPage) {
            if (dirOrPage === 'prev') {
                if (_statsPage > 1) _statsPage--;
            } else if (dirOrPage === 'next') {
                if (_statsPage < _statsTotalPages) _statsPage++;
            } else {
                _statsPage = Math.max(1, Math.min(dirOrPage, _statsTotalPages));
            }
            loadDbStats();
        }

        async function loadDbStats() {
            try {
                const res = await fetch(`/api/stats?page=${_statsPage}`);
                const data = await res.json();
                if(data.success === false) return;

                document.getElementById('statTotalDl').innerText = data.total_count || 0;
                document.getElementById('statTotalSize').innerText = ((data.total_size_bytes || 0) / (1024*1024)).toFixed(2) + ' MB';
                const spCount = data.sources['spotify'] || 0;
                const ytCount = data.sources['youtube'] || 0;
                document.getElementById('statSpotify').innerText = spCount;
                document.getElementById('statYoutube').innerText = ytCount;

                _statsTotalPages = data.total_pages || 1;
                _statsPage = data.page || 1;
                renderStatsPagination();

                const ctx = document.getElementById('statsChart');
                if(ctx) {
                    if(statsChartInstance) { statsChartInstance.destroy(); statsChartInstance = null; }
                    // Explicitly set canvas pixel dimensions to ensure Chart.js
                    // has a defined drawing area even if panel was previously hidden
                    const totalData = (data.total_count || 0);
                    if (totalData > 0) {
                        const parent = ctx.parentElement;
                        ctx.width = Math.max(200, (parent.clientWidth || 280) - 44);
                        ctx.height = 220;
                        try {
                            statsChartInstance = new Chart(ctx, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Spotify', 'YouTube', 'Lainnya'],
                                    datasets: [{
                                        data: [spCount, ytCount, totalData - spCount - ytCount],
                                        backgroundColor: ['#1DB954', '#FF0000', '#d97706'],
                                        borderWidth: 0,
                                        hoverOffset: 4
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    cutout: '70%',
                                    plugins: {
                                        legend: { position: 'bottom', labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#fef3c7', padding: 20, font: { family: 'Inter', size: 12 } } },
                                        title: { display: true, text: 'Proporsi Sumber Unduhan', color: getComputedStyle(document.documentElement).getPropertyValue('--chart-muted').trim() || '#a8a29e', font: { family: 'Inter', size: 14, weight: 'normal' } }
                                    }
                                }
                            });
                        } catch(chartErr) {
                            console.error('Chart render error:', chartErr);
                        }
                    }
                }

                const tbody = document.getElementById('recentDownloadsTbody');
                tbody.innerHTML = '';
                if(!data.recent || data.recent.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="padding:15px; text-align:center; color:var(--text-muted);">Belum ada riwayat unduhan.</td></tr>';
                } else {
                    data.recent.forEach(item => {
                        const tr = document.createElement('tr');
                        const sizeMB = (item.size_bytes / (1024*1024)).toFixed(2) + ' MB';
                        let sourceIcon = '';
                        if(item.source === 'spotify') sourceIcon = '<i class="fa-brands fa-spotify" style="color:#1DB954"></i> Spotify';
                        else if(item.source === 'youtube') sourceIcon = '<i class="fa-brands fa-youtube" style="color:#FF0000"></i> YouTube';
                        else sourceIcon = item.source;

                        tr.innerHTML = `
                            <td style="padding:12px 15px; border-bottom:1px solid var(--border); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.filename}">${item.filename}</td>
                            <td style="padding:12px 15px; border-bottom:1px solid var(--border);">${sourceIcon}</td>
                            <td style="padding:12px 15px; border-bottom:1px solid var(--border);">${sizeMB}</td>
                            <td style="padding:12px 15px; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:12px;">${item.timestamp}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
            } catch(e) { console.error(e); }
        }

        async function resetStats() {
            if (!confirm('⚠️ Reset semua data statistik?\n\nData tidak bisa dikembalikan!')) return;
            try {
                const res = await csrfFetch('/api/stats/reset', {method: 'POST'});
                const data = await res.json();
                showToast(data.message || 'Statistik direset!', data.success ? 'success' : 'error');
                if(data.success) loadDbStats();
            } catch(err) { showToast('Connection Error!', 'error'); }
        }

        async function loadStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                document.getElementById('statStorage').innerText = data.storage_free + ' Free';

                const wStatus = data.watcher;
                document.getElementById('statWatcher').innerText = wStatus ? 'Running' : 'Stopped';
                const bWatcher = document.getElementById('badgeWatcher');
                bWatcher.className = wStatus ? 'badge badge-active' : 'badge badge-inactive';
                bWatcher.innerText = wStatus ? 'Running' : 'Offline';
                const btnWatch = document.getElementById('btnWatch');
                if (btnWatch) {
                    btnWatch.className = wStatus ? 'btn btn-danger' : 'btn';
                    btnWatch.innerHTML = wStatus ? '<i class="fa-solid fa-stop"></i> Stop' : '<i class="fa-solid fa-play"></i> Start';
                    btnWatch.onclick = () => toggleDaemon('watch', wStatus ? 'stop' : 'start');
                }

                const tStatus = data.telegram;
                document.getElementById('statTele').innerText = tStatus ? 'Active' : 'Offline';
                const bTele = document.getElementById('badgeTele');
                bTele.className = tStatus ? 'badge badge-active' : 'badge badge-inactive';
                bTele.innerText = tStatus ? 'Active' : 'Offline';
                const btnTele = document.getElementById('btnTele');
                if (btnTele) {
                    btnTele.className = tStatus ? 'btn btn-danger' : 'btn';
                    btnTele.innerHTML = tStatus ? '<i class="fa-solid fa-stop"></i> Stop' : '<i class="fa-solid fa-play"></i> Start';
                    btnTele.onclick = () => toggleDaemon('telegram', tStatus ? 'stop' : 'start');
                }

                if(document.getElementById('dashTargetDir').innerText === 'Loading...') {
                    document.getElementById('dashTargetDir').innerText = data.target_dir;
                    document.getElementById('setTargetDir').value = data.target_dir;
                }
                document.getElementById('statFiles').innerText = (data.file_count || 0) + ' files';
                if(data.version) {
                    document.getElementById('dashVersion').innerText = 'v' + data.version;
                    document.getElementById('mobileVersion').innerText = 'v' + data.version;
                    document.getElementById('sideVersion').innerText = data.version;
                }
            } catch(e) {}
        }
        setInterval(loadStatus, 3000);
        loadStatus();
        loadNotifConfig();
        loadSchedulerStatus();
        loadScheduledPlaylists();
        setInterval(loadSchedulerStatus, 10000);

        // ============================================
        // THEME TOGGLE (Dark/Light Mode)
        // ============================================

        function applyTheme(theme) {
            const sideBtn = document.getElementById('sideThemeBtn');
            if (theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
                document.getElementById('themeBadge').innerText = 'Light';
                document.getElementById('themeBadge').className = 'badge badge-active';
                document.getElementById('btnThemeToggle').innerHTML = '<i class="fa-solid fa-moon"></i> Dark Mode';
                document.getElementById('moreThemeLabel').innerText = 'Dark Mode';
                if (sideBtn) sideBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            } else {
                document.documentElement.removeAttribute('data-theme');
                document.getElementById('themeBadge').innerText = 'Dark';
                document.getElementById('themeBadge').className = 'badge badge-active';
                document.getElementById('btnThemeToggle').innerHTML = '<i class="fa-solid fa-sun"></i> Light Mode';
                document.getElementById('moreThemeLabel').innerText = 'Light Mode';
                if (sideBtn) sideBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            }
            // Update Chart.js colors if chart exists
            if (statsChartInstance) {
                const chartColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#fef3c7';
                const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-muted').trim() || '#a8a29e';
                statsChartInstance.options.plugins.legend.labels.color = chartColor;
                statsChartInstance.options.plugins.title.color = mutedColor;
                statsChartInstance.update();
            }
            localStorage.setItem('zdt_theme', theme);
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
            showToast('Tema berubah ke ' + (current === 'light' ? 'Dark' : 'Light'), 'success');
        }

        // Load saved theme on startup
        (function() {
            const saved = localStorage.getItem('zdt_theme');
            if (saved === 'light') {
                applyTheme('light');
            } else {
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
                if (prefersDark) {
                    applyTheme('light');
                }
            }
        })();

        // ============================================
        // AUTO-UPDATE NOTIFICATION
        // ============================================

        async function checkUpdate() {
            try {
                const res = await fetch('/api/update-check');
                const data = await res.json();
                if (data.has_update) {
                    const badge = document.getElementById('updateBadge');
                    badge.setAttribute('data-url', data.release_url || 'https://github.com/muhammad1505/zdt-music-toolkit/releases');
                    badge.title = data.latest + ' tersedia! Klik untuk lihat rilis.';
                    badge.style.display = 'inline-block';
                    showToast(`✨ ${data.latest} tersedia! Klik banner untuk lihat changelog.`, 'info', 8000);
                }
            } catch(e) {}
        }
        setTimeout(checkUpdate, 5000);
        setInterval(checkUpdate, 1800000);

        // TOAST NOTIFICATION LOGIC
        function showToast(message, type = 'info', duration = 4000) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;

            let iconClass = 'fa-solid fa-circle-info';
            if (type === 'success') iconClass = 'fa-solid fa-circle-check';
            if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';

            toast.innerHTML = `<div class="toast-icon"><i class="${iconClass}"></i></div><div>${message}</div>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'toastOut 0.3s forwards';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        // CSRF Token management
        let csrfToken = '';
        let _csrfRefreshing = false;

        async function refreshCsrfToken() {
            if (_csrfRefreshing) return;
            _csrfRefreshing = true;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const res = await fetch('/api/csrf-token', { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (data.csrf_token) csrfToken = data.csrf_token;
            } catch(e) { console.error('CSRF refresh failed:', e); }
            _csrfRefreshing = false;
        }

        async function csrfFetch(url, options = {}) {
            const FETCH_TIMEOUT = 30000;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            if (!options.headers) options.headers = {};
            options.headers['X-CSRF-Token'] = csrfToken;
            if (!options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
            options.signal = controller.signal;

            try {
                const res = await fetch(url, options);
                clearTimeout(timeoutId);

                if (res.status === 403) {
                    await refreshCsrfToken();
                    options.headers['X-CSRF-Token'] = csrfToken;
                    const retryRes = await fetch(url, options);
                    if (retryRes.status !== 403) refreshCsrfToken();
                    return retryRes;
                }

                if (res.status !== 403) refreshCsrfToken();
                return res;
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    throw new Error('Request timeout — server tidak merespon. Coba refresh halaman.');
                }
                throw err;
            }
        }

        refreshCsrfToken();
        setInterval(refreshCsrfToken, 300000);

        // File list cache for search filtering
        let _allFilesCache = [];

        function filterFileList(selectId, query) {
            const sel = document.getElementById(selectId);
            if (!sel) return;
            const q = query.toLowerCase().trim();
            sel.innerHTML = '<option value="">-- Select File --</option>';
            _allFilesCache.forEach(f => {
                if (!q || f.toLowerCase().includes(q)) {
                    sel.innerHTML += `<option value="${f}">${f}</option>`;
                }
            });
        }

        async function loadFiles() {
            try {
                const res = await fetch('/api/files');
                const data = await res.json();
                _allFilesCache = data.files || [];
                const selMeta = document.getElementById('metaFile');
                const selDem = document.getElementById('toolFileDemucs');
                const selComp = document.getElementById('toolFileCompress');
                selMeta.innerHTML = selDem.innerHTML = selComp.innerHTML = '<option value="">-- Select File --</option>';
                data.files.forEach(f => {
                    const opt = `<option value="${f}">${f}</option>`;
                    selMeta.innerHTML += opt; selDem.innerHTML += opt; selComp.innerHTML += opt;
                });
                ['fileSearchMeta', 'fileSearchTools'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            } catch(e) {}
        }

        function handleFormSubmit(formId, btnId, statusId, apiEndpoint, payloadBuilder, loadingText) {
            document.getElementById(formId).addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById(btnId);
                const status = document.getElementById(statusId);
                const originalHtml = btn.innerHTML;
                btn.disabled = true; btn.innerHTML = `<i class=\"fa-solid fa-circle-notch fa-spin\"></i> ${loadingText}`;

                let slowWarning = setTimeout(() => {
                    showToast('Server masih memproses... mohon tunggu', 'info');
                }, 20000);

                try {
                    const res = await csrfFetch(apiEndpoint, {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payloadBuilder())
                    });
                    clearTimeout(slowWarning);
                    const data = await res.json();
                    showToast(data.message, data.success ? 'success' : 'error');
                    if(data.success && formId !== 'formSettings' && formId !== 'formMeta') e.target.reset();
                    if(formId === 'formSettings') { document.getElementById('dashTargetDir').innerText = 'Loading...'; loadStatus(); }
                } catch(err) {
                    clearTimeout(slowWarning);
                    showToast(err.message || 'Connection Error!', 'error');
                }
                btn.disabled = false; btn.innerHTML = originalHtml;
            });
        }

        // Playlist modal state
        let _playlistItems = [];
        let _playlistUrl = '';
        let _playlistFormat = '';

        function openPlaylistModal(url) {
            _playlistUrl = url;
            _playlistFormat = "audio";
            document.getElementById('playlistFormat').value = _playlistFormat;
            updatePlaylistSpecOptions();
            document.getElementById('playlistModal').style.display = 'flex';
            document.getElementById('playlistItems').innerHTML = '<div style="text-align:center;padding:40px;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Loading playlist...</div>';
            _playlistItems = [];

            csrfFetch('/api/playlist/items', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url: url})
            })
            .then(r => r.json())
            .then(data => {
                if (data.success && data.items) {
                    _playlistItems = data.items;
                    renderPlaylistItems(data.items);
                } else {
                    document.getElementById('playlistItems').innerHTML =
                        `<div style="text-align:center;padding:40px;color:#e74c3c;"><i class="fa-solid fa-exclamation-triangle"></i> ${data.message || 'Gagal fetch playlist'}</div>`;
                }
            })
            .catch(() => {
                document.getElementById('playlistItems').innerHTML =
                    '<div style="text-align:center;padding:40px;color:#e74c3c;">Network error saat fetch playlist</div>';
            });
        }

        function closePlaylistModal(e) {
            if (e && e.target !== e.currentTarget) return;
            document.getElementById('playlistModal').style.display = 'none';
        }

        function updatePlaylistSpecOptions() {
            const fmt = document.getElementById('playlistFormat').value;
            const sel = document.getElementById('playlistSpec');
            const qsel = document.getElementById('playlistQuality');
            const bsel = document.getElementById('playlistBitrate');
            sel.innerHTML = '';
            if (fmt === 'audio') {
                sel.innerHTML = `<option value="1">M4A</option><option value="2">MP3</option><option value="3">FLAC</option><option value="4">WAV</option><option value="5">OPUS</option><option value="6">OGG</option>`;
                qsel.style.display = 'none';
                bsel.style.display = 'inline-block';
            } else {
                sel.innerHTML = `<option value="1">MP4</option><option value="2">MKV</option><option value="3">WebM</option>`;
                qsel.style.display = 'inline-block';
                bsel.style.display = 'none';
            }
        }
        document.getElementById('playlistFormat').addEventListener('change', updatePlaylistSpecOptions);

        function renderPlaylistItems(items) {
            const container = document.getElementById('playlistItems');
            const info = document.getElementById('playlistInfo');
            info.innerHTML = `<span style="color:#888;">📋 ${items.length} lagu ditemukan</span>`;
            if (!items.length) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Playlist kosong</div>';
                return;
            }
            container.innerHTML = items.map((item, i) =>
                `<label class="pl-item">
                    <input type="checkbox" class="pl-checkbox" data-index="${i}" checked
                           onchange="updatePlaylistCounter()">
                    <span class="pl-title">${escHtml(item.title)}</span>
                    <span class="pl-artist">${escHtml(item.artist)}</span>
                </label>`
            ).join('');
            updatePlaylistCounter();
        }

        function escHtml(s) {
            const d = document.createElement('div');
            d.textContent = s || '';
            return d.innerHTML;
        }

        function filterPlaylistItems() {
            const q = document.getElementById('playlistSearch').value.toLowerCase().trim();
            const items = _playlistItems;
            document.querySelectorAll('.pl-item').forEach((el, i) => {
                if (!q || items[i] && (items[i].title.toLowerCase().includes(q) || items[i].artist.toLowerCase().includes(q))) {
                    el.style.display = 'flex';
                } else {
                    el.style.display = 'none';
                }
            });
            updatePlaylistCounter();
        }

        function toggleAllPlaylistItems(checked) {
            document.querySelectorAll('.pl-checkbox').forEach(cb => cb.checked = checked);
            updatePlaylistCounter();
        }

        function updatePlaylistCounter() {
            const visible = document.querySelectorAll('.pl-item[style*="display: flex"], .pl-item:not([style*="display"])');
            const total = visible.length;
            const checked = document.querySelectorAll('.pl-checkbox:checked').length;
            document.getElementById('playlistCounter').textContent = `${checked} / ${total} terpilih`;
        }

        function getSelectedPlaylistUrls() {
            const urls = [];
            document.querySelectorAll('.pl-checkbox:checked').forEach(cb => {
                const idx = parseInt(cb.dataset.index);
                if (_playlistItems[idx]) urls.push(_playlistItems[idx].url);
            });
            return urls;
        }

        function downloadFullPlaylist() {
            closePlaylistModal();
            clearLogContent();
            const fmt = document.getElementById('playlistFormat').value;
            const spec = document.getElementById('playlistSpec').value;
            const bitrate = document.getElementById('playlistBitrate').value;
            const quality = document.getElementById('playlistQuality').value;
            performDownload(_playlistUrl, fmt, spec, fmt === 'audio' ? bitrate : '', fmt === 'video' ? quality : '');
        }

        function downloadSelectedItems() {
            const urls = getSelectedPlaylistUrls();
            if (!urls.length) { showToast('Pilih minimal 1 lagu!', 'error'); return; }
            closePlaylistModal();
            clearLogContent();
            const fmt = document.getElementById('playlistFormat').value;
            const spec = document.getElementById('playlistSpec').value;
            const bitrate = document.getElementById('playlistBitrate').value;
            const quality = document.getElementById('playlistQuality').value;

            const btn = document.getElementById('btnDl');
            const originalHtml = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> BATCH...';

            const body = {urls: urls, format: fmt, spec: spec};
            if (fmt === 'audio') body.bitrate = bitrate;
            if (fmt === 'video') body.quality = quality;
            csrfFetch('/api/download-selected', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            })
            .then(r => r.json())
            .then(data => {
                showToast(data.message || 'Batch download dimulai!', data.success ? 'success' : 'error');
            })
            .catch(err => {
                showToast(err.message || 'Connection Error!', 'error');
            })
            .finally(() => {
                btn.disabled = false; btn.innerHTML = originalHtml;
            });
        }

        function performDownload(url, fmt, spec, bitrate, quality) {
            clearLogContent();
            const btn = document.getElementById('btnDl');
            const status = document.getElementById('dlStatus');
            const originalHtml = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> EXECUTING...';

            const body = {url: url, format: fmt, spec: spec, bitrate: bitrate};
            if (fmt === 'video' && quality) body.quality = quality;
            csrfFetch('/api/download', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            })
            .then(res => res.json())
            .then(data => {
                showToast(data.message, data.success ? 'success' : 'error');
            })
            .catch(err => {
                showToast(err.message || 'Connection Error!', 'error');
            })
            .finally(() => {
                btn.disabled = false; btn.innerHTML = originalHtml;
            });
        }

        // Playlist detection: intercept submit, open modal instead
        document.getElementById('formDownloader').addEventListener('submit', function(e) {
            const url = document.getElementById('dlUrl').value;
            if (url.match(/[?&](list|playlist)=/i)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openPlaylistModal(url);
            }
        }, true); // capture phase — runs before handleFormSubmit

        handleFormSubmit('formDownloader', 'btnDl', 'dlStatus', '/api/download', () => ({
            url: document.getElementById('dlUrl').value,
            format: "audio"
        }), 'EXECUTING...');

        handleFormSubmit('formSpotify', 'btnSp', 'spStatus', '/api/spotify-sync', () => ({
            url: document.getElementById('spUrl').value
        }), 'SYNCING...');

        handleFormSubmit('formMeta', 'btnMeta', 'metaStatus', '/api/metadata', () => ({
            filename: document.getElementById('metaFile').value,
            title: document.getElementById('metaTitle').value,
            artist: document.getElementById('metaArtist').value
        }), 'INJECTING...');

        handleFormSubmit('formSettings', 'btnSettings', 'settingsStatus', '/api/settings/storage', () => ({
            path: document.getElementById('setTargetDir').value
        }), 'SAVING...');

        async function runTool(toolType) {
            showToast('Dispatching command to server...', 'info');

            let payload = { action: toolType, csrf_token: csrfToken };
            if (toolType === 'demucs') {
                payload.filename = document.getElementById('toolFileDemucs').value;
                if (!payload.filename) return alert("Please select a file first!");
            }
            if (toolType === 'compress') {
                payload.filename = document.getElementById('toolFileCompress').value;
                if (!payload.filename) return alert("Please select a file first!");
            }

            try {
                const res = await csrfFetch('/api/tools', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
                if(data.success) { loadFiles(); loadStatus(); }
            } catch(err) {
                showToast(err.message || 'Connection Error!', 'error');
            }
        }

        async function toggleDaemon(service, action) {
            showToast(`Sending ${action} command to ${service}...`, 'info');
            try {
                const res = await csrfFetch('/api/daemon', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ service, action, csrf_token: csrfToken })
                });
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
                loadStatus();
            } catch(err) {
                showToast(err.message || 'Connection Error!', 'error');
            }
        }

        // ============================================
        // NOTIFICATION & SCHEDULER FUNCTIONS
        // ============================================

        async function loadNotifConfig() {
            try {
                const res = await fetch('/api/notify/config');
                const data = await res.json();
                const badge = document.getElementById('notifStatusBadge');
                if (data.configured) {
                    badge.className = 'badge badge-active';
                    badge.innerText = 'Terkonfigurasi';
                    document.getElementById('notifToken').value = '***saved***';
                    document.getElementById('notifChatId').value = data.chat_id;
                } else {
                    badge.className = 'badge badge-inactive';
                    badge.innerText = 'Belum dikonfigurasi';
                }
            } catch(e) {}
        }

        document.getElementById('formNotif').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnNotif');
            const originalHtml = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> MENYIMPAN...';
            try {
                const res = await csrfFetch('/api/notify/config', {
                    method: 'POST',
                    body: JSON.stringify({
                        token: document.getElementById('notifToken').value,
                        chat_id: document.getElementById('notifChatId').value
                    })
                });
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
                if(data.success) loadNotifConfig();
            } catch(err) { showToast('Connection Error!', 'error'); }
            btn.disabled = false; btn.innerHTML = originalHtml;
        });

        async function testNotification() {
            const btn = document.getElementById('btnTestNotif');
            const originalHtml = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> MENGIRIM...';
            try {
                const res = await csrfFetch('/api/notify/test', {method: 'POST'});
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
            } catch(err) { showToast('Connection Error!', 'error'); }
            btn.disabled = false; btn.innerHTML = originalHtml;
        }

        async function loadSchedulerStatus() {
            try {
                const res = await fetch('/api/scheduler/status');
                const data = await res.json();
                const badge = document.getElementById('badgeScheduler');
                const btn = document.getElementById('btnScheduler');
                if (data.running) {
                    badge.className = 'badge badge-active';
                    badge.innerText = 'Running';
                    btn.className = 'btn btn-danger';
                    btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
                } else {
                    badge.className = 'badge badge-inactive';
                    badge.innerText = 'Offline';
                    btn.className = 'btn';
                    btn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
                }
            } catch(e) {}
        }

        async function toggleScheduler() {
            try {
                const isRunning = document.getElementById('badgeScheduler').classList.contains('badge-active');
                const action = isRunning ? 'stop' : 'start';
                showToast(`Sending ${action} scheduler...`, 'info');

                const res = await csrfFetch('/api/daemon', {
                    method: 'POST',
                    body: JSON.stringify({ service: 'scheduler', action })
                });
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
                loadSchedulerStatus();
            } catch(err) {
                showToast(err.message || 'Connection Error!', 'error');
            }
        }

        async function loadScheduledPlaylists() {
            try {
                const res = await fetch('/api/scheduler/playlists');
                const data = await res.json();
                const tbody = document.getElementById('schedTbody');
                if (!data.playlists || data.playlists.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="padding:15px; text-align:center; color:var(--text-muted);">Belum ada playlist terjadwal.</td></tr>';
                    return;
                }
                tbody.innerHTML = '';
                data.playlists.forEach((item, idx) => {
                    const tr = document.createElement('tr');
                    const interval = item.interval_hours + ' jam';
                    const lastRun = item.last_run ? new Date(item.last_run).toLocaleString('id-ID') : 'Belum pernah';
                    const status = item.last_status === 'ok' ? '<span style="color:var(--accent);">OK</span>' :
                                   item.last_status === 'failed' ? '<span style="color:var(--danger);">Failed</span>' : '-';
                    tr.innerHTML = `
                        <td style="padding:12px 15px; border-bottom:1px solid var(--border);">${item.name || '-'}</td>
                        <td style="padding:12px 15px; border-bottom:1px solid var(--border); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.url}">${item.url}</td>
                        <td style="padding:12px 15px; border-bottom:1px solid var(--border);">${interval}</td>
                        <td style="padding:12px 15px; border-bottom:1px solid var(--border); color:var(--text-muted); font-size:12px;">${lastRun} ${status}</td>
                        <td style="padding:12px 15px; border-bottom:1px solid var(--border);">
                            <button class="btn btn-danger" style="width:auto; padding:5px 10px; font-size:11px;" onclick="removeSchedPlaylist(${idx})"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch(e) {}
        }

        document.getElementById('formScheduler').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSched');
            const originalHtml = btn.innerHTML;
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> MENYIMPAN...';
            try {
                const getRes = await fetch('/api/scheduler/playlists');
                const current = await getRes.json();
                if (!current.playlists) current.playlists = [];

                current.playlists.push({
                    url: document.getElementById('schedUrl').value,
                    name: document.getElementById('schedName').value || '',
                    interval_hours: parseInt(document.getElementById('schedInterval').value)
                });

                const res = await csrfFetch('/api/scheduler/playlists', {
                    method: 'POST',
                    body: JSON.stringify(current)
                });
                const data = await res.json();
                showToast(data.message, data.success ? 'success' : 'error');
                if (data.success) {
                    e.target.reset();
                    loadScheduledPlaylists();
                }
            } catch(err) { showToast('Connection Error!', 'error'); }
            btn.disabled = false; btn.innerHTML = originalHtml;
        });

        async function removeSchedPlaylist(index) {
            try {
                const getRes = await fetch('/api/scheduler/playlists');
                const current = await getRes.json();
                current.playlists.splice(index, 1);
                const res = await csrfFetch('/api/scheduler/playlists', {
                    method: 'POST', body: JSON.stringify(current)
                });
                const data = await res.json();
                showToast(data.message, 'success');
                loadScheduledPlaylists();
            } catch(err) { showToast('Connection Error!', 'error'); }
        }

        // ============================================
        // SYSTEM LOGS VIEWER
        // ============================================

        async function loadSystemLogs() {
            const lines = document.getElementById('syslogLines')?.value || '50';
            const tbody = document.getElementById('syslogTbody');
            const status = document.getElementById('syslogStatus');
            const source = document.getElementById('syslogSource');

            tbody.innerHTML = '<tr><td colspan="3" style="padding:20px; text-align:center; color:var(--text-muted);">Memuat log...</td></tr>';

            try {
                const res = await fetch(`/api/system/logs?lines=${lines}`);
                const data = await res.json();

                if (data.source) {
                    source.textContent = 'Sumber: ' + data.source;
                } else {
                    source.textContent = data.error || 'Log tidak tersedia';
                }

                if (data.entries && data.entries.length > 0) {
                    tbody.innerHTML = '';
                    data.entries.slice().reverse().forEach(entry => {
                        const tr = document.createElement('tr');
                        const level = entry.message && (entry.message.toLowerCase().includes('error') || entry.message.toLowerCase().includes('fail'))
                            ? 'color:var(--danger);'
                            : entry.message && (entry.message.toLowerCase().includes('warn') || entry.message.toLowerCase().includes('timeout'))
                            ? 'color:var(--warning);'
                            : 'color:var(--log-color);';
                        tr.innerHTML = `
                            <td style="padding:6px 12px; border-bottom:1px solid var(--border); white-space:nowrap; color:var(--text-muted); font-size:11px;">${entry.timestamp || '-'}</td>
                            <td style="padding:6px 12px; border-bottom:1px solid var(--border); white-space:nowrap;"><span style="background:var(--switch-bg); padding:2px 8px; border-radius:4px; font-size:11px;">${entry.program || '-'}</span></td>
                            <td style="padding:6px 12px; border-bottom:1px solid var(--border); ${level}">${entry.message || ''}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                } else {
                    tbody.innerHTML = '<tr><td colspan="3" style="padding:20px; text-align:center; color:var(--text-muted);">Tidak ada log yang ditemukan.</td></tr>';
                }
                status.className = 'status-box';
            } catch(e) {
                tbody.innerHTML = '<tr><td colspan="3" style="padding:20px; text-align:center; color:var(--danger);">Gagal memuat log: ' + e.message + '</td></tr>';
                status.className = 'status-box error';
                status.textContent = 'Koneksi error. Coba lagi.';
            }
        }

        // ============================================
        // MORE MENU FUNCTIONS
        // ============================================

        function toggleMoreMenu() {
            document.getElementById('moreOverlay').classList.toggle('show');
            document.getElementById('moreSheet').classList.toggle('show');
            document.querySelector('.nav-more-trigger').classList.toggle('active');
        }
        function closeMoreMenu() {
            document.getElementById('moreOverlay').classList.remove('show');
            document.getElementById('moreSheet').classList.remove('show');
            document.querySelector('.nav-more-trigger').classList.remove('active');
        }
        function moreNav(tabId) {
            closeMoreMenu();
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(n => {
                if(n.getAttribute('onclick') && n.getAttribute('onclick').includes(tabId)) n.classList.add('active');
            });
            document.querySelector('.nav-more-trigger').classList.add('active');
            const titles = {
                'metadata': ['Metadata Editor', 'Fix missing album art and ID3 tags'],
                'system': ['System Daemons', 'Manage background automation services'],
                'logs': ['System Logs', 'System journal dan log troubleshooting'],
                'settings': ['Global Settings', 'Configure ZDT core behaviors'],
                'notifikasi': ['Notifikasi Telegram', 'Konfigurasi notifikasi otomatis ke Telegram'],
                'scheduler': ['Auto-Sync Scheduler', 'Jadwalkan sinkronisasi Spotify otomatis']
            };
            if(titles[tabId]) {
                document.getElementById('pageTitle').innerText = titles[tabId][0];
                document.getElementById('pageSubtitle').innerText = titles[tabId][1];
            }
            if(tabId === 'metadata') loadFiles();
        }

        let _logAutoCloseTimer = null;

        function showFloatingLog() {
            const panel = document.getElementById('floatingLog');
            panel.classList.remove('minimized');
            panel.style.display = 'flex';
            document.getElementById('floatingLogBtn').style.display = 'none';
            if (_logAutoCloseTimer) { clearTimeout(_logAutoCloseTimer); _logAutoCloseTimer = null; }
        }

        function hideFloatingLog() {
            document.getElementById('floatingLog').style.display = 'none';
            document.getElementById('floatingLogBtn').style.display = 'none';
        }

        function toggleLogMinimize() {
            const panel = document.getElementById('floatingLog');
            panel.classList.toggle('minimized');
            if (panel.classList.contains('minimized')) {
                document.getElementById('floatingLogBtn').style.display = 'flex';
            } else {
                document.getElementById('floatingLogBtn').style.display = 'none';
            }
        }

        function toggleLogRestore() {
            document.getElementById('floatingLog').classList.remove('minimized');
            document.getElementById('floatingLogBtn').style.display = 'none';
        }

        function scheduleLogAutoClose() {
            if (_logAutoCloseTimer) clearTimeout(_logAutoCloseTimer);
            _logAutoCloseTimer = setTimeout(() => {
                hideFloatingLog();
                // Auto clear log on close
                fetch('/api/logs/clear', {method: 'POST'}).catch(() => {});
            }, 5000);
        }

        async function closeLogs() {
            hideFloatingLog();
            try {
                await csrfFetch('/api/logs/clear', {method: 'POST'});
            } catch(err) {}
        }

        function clearLogContent() {
            document.getElementById("terminalLog").textContent = "System ready. Waiting for task execution...";
            document.getElementById("liveProgressWrapper").style.display = "none";
            document.getElementById("liveProgressFill").style.width = "0%";
            document.getElementById("liveProgressPct").innerText = "0%";
        }

        // ============================================
        // REAL-TIME LOG STREAM via SSE
        // ============================================

        function updateLogUI(logContent, isActive) {
            const term = document.getElementById("terminalLog");
            const wrapper = document.getElementById("liveProgressWrapper");
            const fill = document.getElementById("liveProgressFill");
            const pctSpan = document.getElementById("liveProgressPct");
            const taskSpan = document.getElementById("liveProgressTask");
            const btnStatus = document.getElementById("logBtnStatus");

            if (isActive && logContent && logContent.trim().length > 0) {
                if (_logAutoCloseTimer) { clearTimeout(_logAutoCloseTimer); _logAutoCloseTimer = null; }
                showFloatingLog();

                if (term.textContent !== logContent) {
                    term.textContent = logContent;
                    term.scrollTop = term.scrollHeight;

                    const logLines = logContent.split('\n');
                    let lastProgressLine = "";
                    for (let i = logLines.length - 1; i >= 0; i--) {
                        if (logLines[i].includes('%')) { lastProgressLine = logLines[i]; break; }
                    }

                    if (lastProgressLine) {
                        wrapper.style.display = "block";
                        const match = lastProgressLine.match(/(\d+\.?\d*)%/);
                        if (match && match[1]) {
                            fill.style.width = match[1] + '%';
                            pctSpan.innerText = match[1] + '%';
                            btnStatus.innerText = match[1] + '%';

                            if (lastProgressLine.toLowerCase().includes('download')) taskSpan.innerText = "Downloading Media...";
                            else if (lastProgressLine.toLowerCase().includes('split')) taskSpan.innerText = "Splitting Stems (Demucs)...";
                            else if (lastProgressLine.toLowerCase().includes('size')) taskSpan.innerText = "Compressing Media (FFmpeg)...";
                            else taskSpan.innerText = "Processing...";
                        }
                    } else {
                        wrapper.style.display = "none";
                    }
                }
            } else if (!isActive && logContent) {
                // Task completed — show completed state briefly then auto-close
                const lines = logContent.split('\n').filter(l => l.trim());
                const lastLine = lines[lines.length-1] || '';
                btnStatus.innerText = 'Done';
                wrapper.style.display = "none";
                if (term.textContent !== logContent) {
                    term.textContent = logContent;
                    term.scrollTop = term.scrollHeight;
                }
                scheduleLogAutoClose();
            } else {
                hideFloatingLog();
                wrapper.style.display = "none";
            }
        }

        let sseSource = null;

        let _sseRetryCount = 0;
        let _sseRetryTimer = null;

        function connectSSE() {
            if (sseSource) {
                sseSource.close();
            }
            if (_sseRetryCount >= 10) {
                console.warn('SSE: too many retries, giving up');
                return;
            }
            sseSource = new EventSource('/api/logs/stream');
            _sseRetryCount++;

            sseSource.onopen = function() {
                _sseRetryCount = 0;
            };

            sseSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    updateLogUI(data.log, data.active);
                } catch(e) {}
            };

            sseSource.onerror = function() {
                sseSource.close();
                const delay = Math.min(3000 * Math.pow(2, _sseRetryCount), 60000);
                if (_sseRetryTimer) clearTimeout(_sseRetryTimer);
                _sseRetryTimer = setTimeout(connectSSE, delay);
            };
        }

        connectSSE();

        setInterval(async () => {
            if (!sseSource || sseSource.readyState === EventSource.CLOSED) {
                _sseRetryCount = 0;
                connectSSE();
            }
        }, 15000);
