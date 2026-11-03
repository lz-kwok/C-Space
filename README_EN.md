<div align="center">

<img src="./src-tauri/icons/128x128.png" alt="C-Space Logo" width="100" height="100" />

# C-Space · C-Drive Cleaner & Migration Tool

**A high-performance Windows C-drive inspection, safe cleanup, and seamless AppData migration tool built with Tauri v2, Rust, and React 19.**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](#)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB.svg?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.97%2B-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](./README_EN.md) · [简体中文](./README.md) · [Architecture Document](./ARCHITECTURE.md)

</div>

---

## 📖 Introduction

During prolonged use of Windows systems, the system C-drive frequently runs low on storage due to unchecked software caches, developer package dependencies, communication app media, and Windows update logs.

**C-Space** is designed specifically for Windows power users and developers:
1. **Accurate Identification**: Built-in 50+ fingerprint rules and a heuristic engine accurately identify which application created each directory and explain its exact purpose and risk.
2. **Safe Cleanup**: A strict 3-tier risk evaluation system (🟢 Safe / 🟡 Caution / 🔴 Danger) strictly prevents accidental deletion of essential system files, supporting both Recycle Bin and permanent deletion with real-time progress streaming.
3. **Seamless Migration**: For massive write-locked folders in `AppData` and development toolchains, it performs an atomic transactional migration to secondary storage and creates a **Windows NTFS Directory Junction (`mklink /J`)** in place. Applications continue reading and writing normally without configuration changes, and newly generated caches automatically persist on the new drive.
4. **Link Ledger**: Provides a unified dashboard for all cross-drive reparse links, detects broken links, enables one-click restoration back to the C-drive, and supports manual creation of directory junctions, symbolic links, and hardlinks.

---

## ✨ Key Features

### 1. 🔍 Deep C-Drive Inspection & Purpose Identification
- **Comprehensive Ruleset (R1–R12)**: Covers developer toolchains (VS Code, Cursor, JetBrains, npm, pnpm, pip, cargo, gradle, maven, conda, Ollama, Docker, WSL, etc.), daily office and social software (WeChat, DingTalk, Feishu, QQ, WPS), browsers (Chrome, Edge, Firefox), and system driver caches.
- **Heuristic Discovery**: Automatically analyzes uncataloged applications using directory depth and naming patterns (`*cache*`, `*logs*`, `*temp*`, etc.) to provide risk ratings.
- **Ultra-Low Memory Streaming Scan**: Employs streaming iterators (`walkdir`) with $O(1)$ constant memory overhead, while strictly skipping Reparse Points (Junctions / Symlinks) to prevent cross-drive double-counting and circular loops.
- **Progressive UI Updates**: Emits scanning progress asynchronously node-by-node; results appear on the screen immediately without waiting for the full disk scan to finish.

### 2. 📦 Big Files Deep Scanner & Locator
- **Configurable Thresholds**: Quickly discovers massive files matching ≥50MB, ≥100MB, ≥500MB, ≥1GB, or ≥5GB.
- **Smart Categorization**: Categorizes discovered files into Virtual Machine Disks (VHDX/VMDK/ISO), AI Weights/Models (GGUF/Safetensors/Bin/Pt), Media (Video/Audio), Archives (Zip/7z/Rar), Executables/DLLs, and Database Backups.
- **Direct Actions**: Open directly in Windows File Explorer (`/select`), copy paths, or move safely to the Recycle Bin.

### 3. 👯 Duplicate Files Multi-Stage Hash Analysis & Hardlink Replacement
- **3-Stage Progressive Pipeline**:
  1. *Phase 1*: Exact byte size grouping to instantly filter out unique files.
  2. *Phase 2*: Head 8KB + Tail 8KB quick sample hashing for fast candidate matching.
  3. *Phase 3*: Streaming SHA-256 full content verification (100% false-positive free).
- **Smart Pre-selection**: One-click "Keep Newest", "Keep Oldest", or "Keep Shortest Path".
- **NTFS Hardlink Deduplication**: Instead of purely deleting duplicates, users can replace duplicate copies with **NTFS Hardlinks pointing to the original file**. Reclaims disk space immediately while maintaining full software compatibility and file access across all original paths!

### 4. 🧹 Targeted & Safe Smart Cleanup
- **Real-Time Progress Streaming**: Emits live progress events (`clean-progress`) showing current file path, freed disk space, deleted count, and percentage completion.
- **3-Tier Risk Guard**:
  - 🟢 **Safe**: Temporary caches, crash dumps, and obsolete installers that can be cleared safely.
  - 🟡 **Caution**: Build caches, old logs, and shader caches that can be rebuilt if needed.
  - 🔴 **Danger**: Critical system binaries and user documents that are strictly protected by backend execution blocks.
- **Automatic Lock Bypass**: Safely skips files locked by active processes to preserve system stability and writes an audit log to disk.

### 5. 🚚 AppData Zero-Loss Migration
- **Smart Recommendation Hub**: Scans for large candidate folders in `AppData` and allows users to load migration plans with a single click.
- **Native Directory Junctions (`mklink /J`)**: Reroutes filesystem I/O transparently at the NTFS kernel layer.
- **Process Lock Interceptor (Restart Manager API)**: Detects running processes locking target files and offers one-click termination before migration begins.
- **Atomic Transactional Rollback**: Follows a strict 5-step pipeline: "Precheck ➔ Physical Copy ➔ Data Verification ➔ Rename Backup ➔ Create Junction ➔ Space Reclaim". Any failure triggers immediate automatic rollback.

### 6. 🔗 Link Lifecycle & Ledger Management
- **Centralized Ledger**: Tracks all managed links, alerts users to broken links (missing targets), and supports one-click safe restoration back to the C-drive.
- **Custom Mapping Wizard**: Guides advanced users through creating Directory Junctions (`mklink /J`), Directory Symlinks (`mklink /D`), File Symlinks (`mklink`), and Hardlinks.

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|------|------------|---------|
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/) | Lightweight desktop runtime with minimal memory footprint |
| **System Backend** | [Rust](https://www.rust-lang.org/) | High-throughput, memory-safe multithreaded systems programming |
| **Windows APIs** | `windows-sys` | Native bindings for Restart Manager, ShellExecuteW, TokenElevation |
| **Reparse & Files** | `junction`, `walkdir`, `trash` | NTFS Junction manipulation, streaming disk traversal, cross-platform trash |
| **Frontend** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Modern component-based desktop UI with strict typing |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | High-density dark console aesthetic |
| **Icons** | [Lucide React](https://lucide.dev/) | Clean, consistent vector icon set |

---

## 📂 Directory Layout

```text
C-Space/
├── public/                 # Static assets & web application icons
├── src/                    # React 19 Frontend
│   ├── pages/              # View pages (Explorer, Cleaner, Migrator, Links, Settings)
│   ├── types.ts            # Shared IPC data interfaces
│   ├── utils.ts            # Formatting utilities
│   ├── App.tsx             # Root layout & dashboard
│   ├── main.tsx            # React entry
│   └── index.css           # Global theme & scrollbar styles
│
├── src-tauri/              # Rust Systems Backend
│   ├── icons/              # Multi-resolution icons (ICO, ICNS, PNG)
│   ├── rules/              # Built-in JSON rulesets (system, dev_browser, apps)
│   ├── src/
│   │   ├── cleaner.rs      # Cleanup engine & event broadcaster
│   │   ├── ledger.rs       # Local persistent ledger store
│   │   ├── links.rs        # Junction & symlink operations
│   │   ├── migrator.rs     # Transactional migrator & Restart Manager
│   │   ├── rules.rs        # Rule evaluation & macro expansion
│   │   ├── scanner.rs      # Low-memory progressive directory scanner
│   │   ├── winapi.rs       # Win32 API system wrappers
│   │   ├── lib.rs          # Tauri command registrations
│   │   └── main.rs         # Binary entry point
│   ├── Cargo.toml          # Rust dependency manifest
│   ├── tauri.conf.json     # Tauri v2 configuration
│   ├── app.manifest        # Release admin execution manifest
│   └── app.dev.manifest    # Dev standard execution manifest
│
├── ARCHITECTURE.md         # Full system architecture documentation
├── app-icon.svg            # Vector app logo source
├── package.json            # Node.js project configuration
└── vite.config.ts          # Vite bundler configuration
```

---

## 🚀 Getting Started

### Prerequisites

Ensure the following tools are installed in your Windows environment:
- **Node.js** >= 18.0.0
- **Rust** >= 1.77 (Recommended toolchain: `x86_64-pc-windows-msvc`)
- **C++ Build Tools** (Visual Studio 2022 Community with "Desktop development with C++")
- **WebView2 Runtime** (Preinstalled on Windows 10/11)

### 1. Install Dependencies

```bash
npm install
```

### 2. Local Development

```bash
npm run tauri dev
```
> **Note**: In development mode, the app runs with standard user privileges (`app.dev.manifest`) for fast iteration without frequent UAC prompts. Administrator elevation can be triggered on demand within the app.

### 3. Production Build

```bash
npm run tauri build
```
The installer will be generated under `src-tauri/target/release/bundle/nsis/` with an embedded administrator manifest.

---

## ⚙️ Configuration & Data Storage

All configurations and transaction logs are stored under the current user's roaming directory:
- **Path**: `%APPDATA%\com.cspace.app\`
  - `settings.json`: Global user preferences (default vault drive, recycle bin mode).
  - `ledger.json`: Persistent ledger of managed links and historical migrations.
  - `clean_history.jsonl`: Audit log of previous cleanup executions.
  - `custom_rules.json`: (Optional) User-defined recognition rules.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

