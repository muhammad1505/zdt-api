FROM python:3.11-slim AS backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Build admin dashboard frontend
RUN if [ -f admin-dashboard/package.json ]; then \
        cd admin-dashboard && npm ci && npm run build && rm -rf node_modules; \
    fi

EXPOSE 2000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python3 -c "import urllib.request; exit(0 if urllib.request.urlopen('http://localhost:2000/api/health').status == 200 else 1)"

# Single worker because SQLite doesn't support concurrent writes from multiple processes
CMD ["gunicorn", "--bind", "0.0.0.0:2000", "--workers", "1", "--timeout", "120", "server:app"]
