#!/usr/bin/env python3
"""Recursively replace 'ClipPaste' with 'ClipPaste' in text files under the repo."""
import os
import io

root = r"e:\Copy\ClipPaste"
count = 0
files_changed = []

for dirpath, dirnames, filenames in os.walk(root):
    # skip binary folders like node_modules, .git, target
    if 'node_modules' in dirpath or '\\target\\' in dirpath or '\\.git' in dirpath:
        continue
    for fn in filenames:
        path = os.path.join(dirpath, fn)
        # Only attempt text files by extension
        text_ext = ('.md', '.toml', '.yml', '.yaml', '.ps1', '.json', '.rs', '.ts', '.tsx', '.js', '.py', '.html')
        if not fn.lower().endswith(text_ext):
            continue
        try:
            with io.open(path, 'r', encoding='utf-8') as f:
                s = f.read()
        except UnicodeDecodeError:
            try:
                with io.open(path, 'r', encoding='latin-1') as f:
                    s = f.read()
            except Exception:
                continue
        if 'ClipPaste' in s:
            s2 = s.replace('ClipPaste', 'ClipPaste')
            with io.open(path, 'w', encoding='utf-8') as f:
                f.write(s2)
            count += s.count('ClipPaste')
            files_changed.append(path)

print(f"Replaced {count} occurrences in {len(files_changed)} files")
for p in files_changed:
    print(p)
