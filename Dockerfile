# Use a lightweight, stable Python runtime
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install build dependencies required for compiling certain packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code into container
COPY . .

# Run Uvicorn binding to 0.0.0.0 and Cloud Run's dynamic $PORT
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
