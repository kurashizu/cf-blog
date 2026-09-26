# Keep everything this tool downloads inside tools/ear: no ~/.cache, no ~/.local.
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export UV_CACHE_DIR="$here/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$here/.cache/python"
export UV_PYTHON_BIN_DIR="$here/.cache/bin"
export UV_PROJECT_ENVIRONMENT="$here/.venv"
export HF_HOME="$here/.cache/hf"
export TORCH_HOME="$here/.cache/torch"
export XDG_CACHE_HOME="$here/.cache"
export MPLCONFIGDIR="$here/.cache/mpl"
export HF_HUB_OFFLINE=1
