#!/bin/sh
# Install git hooks for this repository.
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_DIR="$REPO_ROOT/scripts/hooks"

for hook in "$SOURCE_DIR"/*; do
    name="$(basename "$hook")"
    dest="$HOOKS_DIR/$name"
    cp "$hook" "$dest"
    chmod +x "$dest"
    echo "Installed $name"
done

echo "Done. Git hooks are active."
