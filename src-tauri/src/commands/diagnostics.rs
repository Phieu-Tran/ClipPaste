use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessMemoryInfo {
    pub pid: u32,
    pub name: String,
    pub working_set_bytes: u64,
    pub private_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeDiagnostics {
    pub generated_at: String,
    pub app: ProcessMemoryInfo,
    pub dev_helpers: Vec<ProcessMemoryInfo>,
}

#[tauri::command]
pub fn get_runtime_diagnostics() -> Result<RuntimeDiagnostics, String> {
    Ok(RuntimeDiagnostics {
        generated_at: chrono::Utc::now().to_rfc3339(),
        app: current_process_memory()?,
        dev_helpers: dev_helper_processes(),
    })
}

#[cfg(target_os = "windows")]
fn current_process_memory() -> Result<ProcessMemoryInfo, String> {
    let pid = std::process::id();
    let name = std::env::current_exe()
        .ok()
        .and_then(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "clippaste.exe".to_string());

    process_memory(pid, name)
}

#[cfg(not(target_os = "windows"))]
fn current_process_memory() -> Result<ProcessMemoryInfo, String> {
    Ok(ProcessMemoryInfo {
        pid: std::process::id(),
        name: "clippaste".to_string(),
        working_set_bytes: 0,
        private_bytes: 0,
    })
}

#[cfg(target_os = "windows")]
fn process_memory(pid: u32, name: String) -> Result<ProcessMemoryInfo, String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };

    let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) }
        .map_err(|e| e.to_string())?;

    let mut counters = PROCESS_MEMORY_COUNTERS::default();
    let result = unsafe {
        GetProcessMemoryInfo(
            handle,
            &mut counters,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    };
    let _ = unsafe { CloseHandle(handle) };
    result.map_err(|e| e.to_string())?;

    Ok(ProcessMemoryInfo {
        pid,
        name,
        working_set_bytes: counters.WorkingSetSize as u64,
        private_bytes: counters.PagefileUsage as u64,
    })
}

#[cfg(target_os = "windows")]
fn dev_helper_processes() -> Vec<ProcessMemoryInfo> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    if !cfg!(debug_assertions) {
        return Vec::new();
    }

    const HELPERS: &[&str] = &["node.exe", "pnpm.exe", "powershell.exe"];

    let snapshot = match unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) } {
        Ok(handle) => handle,
        Err(_) => return Vec::new(),
    };

    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    let mut processes = Vec::new();
    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok() {
        loop {
            let name = wide_process_name(&entry.szExeFile);
            if HELPERS
                .iter()
                .any(|helper| name.eq_ignore_ascii_case(helper))
            {
                if let Ok(info) = process_memory(entry.th32ProcessID, name) {
                    processes.push(info);
                }
            }

            if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
                break;
            }
        }
    }

    let _ = unsafe { CloseHandle(snapshot) };
    processes.sort_by(|a, b| b.working_set_bytes.cmp(&a.working_set_bytes));
    processes.truncate(12);
    processes
}

#[cfg(not(target_os = "windows"))]
fn dev_helper_processes() -> Vec<ProcessMemoryInfo> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn wide_process_name(buffer: &[u16]) -> String {
    let len = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..len])
}
