# weekend-render.ps1 — self-healing keep-alive around auto-chain-render.js.
# auto-chain is fully resume-safe (skips existing chunks, skips finished jobs),
# so if node crashes / OOMs we can simply relaunch until it writes auto-chain.DONE.
# Launch DETACHED so it survives the terminal / Claude session:
#   Start-Process powershell -ArgumentList '-NoProfile','-File','scripts/weekend-render.ps1' -WindowStyle Hidden
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')
$done = 'auto-chain.DONE'
for ($i = 0; $i -lt 800; $i++) {
    if (Test-Path $done) { break }
    "=== keep-alive launch #$i $(Get-Date -Format o) ===" | Out-File -FilePath 'weekend-render.log' -Append -Encoding utf8
    node scripts/auto-chain-render.js *>> 'auto-chain.log'
    if (Test-Path $done) { break }
    Start-Sleep -Seconds 30
}
"=== weekend-render EXIT $(Get-Date -Format o) (done=$(Test-Path $done)) ===" | Out-File -FilePath 'weekend-render.log' -Append -Encoding utf8
