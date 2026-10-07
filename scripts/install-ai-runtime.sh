#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="${PROJECT_DIR:-/home/hallaym/masofaviy2}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

echo "== HALLAYM AI hardware probe =="
RAM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
RAM_GB="$(( RAM_KB / 1024 / 1024 ))"
CPU_CORES="$(nproc 2>/dev/null || echo 1)"
GPU_NAME="none"
GPU_VRAM_MB=0
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_NAME="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1 || echo none)"
  GPU_VRAM_MB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -n1 | tr -dc '0-9' || echo 0)"
fi

MAIN_MODEL="llama3.2:3b"
FAST_MODEL="llama3.2:3b"
EMBED_MODEL="nomic-embed-text"
PROFILE="cpu-lite"
AI_CONCURRENCY=1
AI_QUEUE=80

if [ "$GPU_VRAM_MB" -ge 20000 ]; then
  MAIN_MODEL="qwen3:14b"; PROFILE="gpu-strong"; AI_CONCURRENCY=4; AI_QUEUE=220
elif [ "$GPU_VRAM_MB" -ge 10000 ]; then
  MAIN_MODEL="qwen3:8b"; PROFILE="gpu-balanced"; AI_CONCURRENCY=2; AI_QUEUE=140
elif [ "$RAM_GB" -ge 48 ]; then
  MAIN_MODEL="qwen3:8b"; PROFILE="cpu-strong"; AI_CONCURRENCY=1; AI_QUEUE=100
elif [ "$RAM_GB" -ge 24 ]; then
  MAIN_MODEL="qwen3:4b"; PROFILE="cpu-balanced"; AI_CONCURRENCY=1; AI_QUEUE=80
fi

echo "RAM: ${RAM_GB} GB"
echo "CPU: ${CPU_CORES} cores"
echo "GPU: ${GPU_NAME} (${GPU_VRAM_MB} MB)"
echo "Profile: ${PROFILE}"
echo "Main model: ${MAIN_MODEL}"
echo "Fast model: ${FAST_MODEL}"
echo "Embed model: ${EMBED_MODEL}"
echo "AI concurrency: ${AI_CONCURRENCY}; queue: ${AI_QUEUE}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://ollama.com/install.sh | sh
  else
    echo "curl topilmadi; Ollama avtomatik o‘rnatilmadi" >&2
    exit 2
  fi
fi

if [ "${AI_SKIP_SERVICE_SETUP:-0}" != "1" ] && command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable ollama >/dev/null 2>&1 || true
  sudo systemctl restart ollama >/dev/null 2>&1 || true
fi

for i in {1..30}; do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "Pulling fast model..."
ollama pull "$FAST_MODEL"
if [ "$MAIN_MODEL" != "$FAST_MODEL" ]; then
  echo "Pulling main model..."
  ollama pull "$MAIN_MODEL"
fi
echo "Pulling embedding model..."
ollama pull "$EMBED_MODEL"

touch "$ENV_FILE"
upsert_env(){
  local key="$1" value="$2"
  if grep -qE "^$key=" "$ENV_FILE"; then
    sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
upsert_env AI_ENABLED true
upsert_env AI_PROVIDER ollama
upsert_env AI_BASE_URL http://127.0.0.1:11434
upsert_env AI_MODEL_MAIN "$MAIN_MODEL"
upsert_env AI_MODEL_FAST "$FAST_MODEL"
upsert_env AI_EMBED_MODEL "$EMBED_MODEL"
upsert_env AI_MAX_CONTEXT 8192
upsert_env AI_TIMEOUT_MS 120000
upsert_env AI_MAX_CONCURRENT "$AI_CONCURRENCY"
upsert_env AI_MAX_QUEUE "$AI_QUEUE"

printf '%s\n' "AI_PROFILE=$PROFILE" > "$PROJECT_DIR/.ai-runtime-profile"
printf '%s\n' "RAM_GB=$RAM_GB" "CPU_CORES=$CPU_CORES" "GPU_NAME=$GPU_NAME" "GPU_VRAM_MB=$GPU_VRAM_MB" "MAIN_MODEL=$MAIN_MODEL" "FAST_MODEL=$FAST_MODEL" "EMBED_MODEL=$EMBED_MODEL" "AI_MAX_CONCURRENT=$AI_CONCURRENCY" "AI_MAX_QUEUE=$AI_QUEUE" >> "$PROJECT_DIR/.ai-runtime-profile"

echo
echo "== HALLAYM AI ready =="
curl -fsS http://127.0.0.1:11434/api/tags || true
