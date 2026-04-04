#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use clippaste::{cli, run_app};

fn main() {
    // Handle CLI commands (--list, --search, etc.) without starting GUI
    if cli::handle_cli() {
        return;
    }
    run_app();
}
