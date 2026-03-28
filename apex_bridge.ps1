# Apex Bridge - PowerShell QuorumAPI Bridge for Electron
# Communicates via stdin/stdout with line-based protocol

$ErrorActionPreference = "SilentlyContinue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dllPath = Join-Path $scriptDir "QuorumAPI.dll"

try {
    [System.Reflection.Assembly]::LoadFrom($dllPath) | Out-Null
    $quorum = New-Object QuorumAPI.QuorumModule
    $quorum.StartCommunication()
    Write-Host "RESULT:ready:ok:Apex Bridge initialized with QuorumAPI"
} catch {
    Write-Host "RESULT:ready:err:Failed to init QuorumAPI - $($_.Exception.Message)"
    exit 1
}

# Main command loop
while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if ($line -eq "") { continue }

    try {
        if ($line -eq "ATTACH") {
            $result = $quorum.AttachAPI().GetAwaiter().GetResult()
            Write-Host "RESULT:attach:ok:$result"
        }
        elseif ($line.StartsWith("EXECUTE:")) {
            $b64 = $line.Substring(8)
            $script = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
            $result = $quorum.ExecuteScript($script)
            Write-Host "RESULT:execute:ok:Script executed - $result"
        }
        elseif ($line -eq "STATUS") {
            $attached = $quorum.IsAttached()
            Write-Host "RESULT:status:ok:$($attached.ToString().ToLower())"
        }
        elseif ($line.StartsWith("AUTOATTACH:")) {
            $val = $line.Substring(11).Trim().ToLower() -eq "true"
            $quorum.SetAutoAttach($val)
            Write-Host "RESULT:autoattach:ok:Auto-attach set to $val"
        }
        elseif ($line -eq "KILL") {
            [QuorumAPI.QuorumModule]::KillRoblox()
            Write-Host "RESULT:kill:ok:Roblox process killed"
        }
        elseif ($line -eq "PING") {
            Write-Host "RESULT:ping:ok:pong"
        }
        elseif ($line -eq "EXIT") {
            $quorum.StopCommunication()
            Write-Host "RESULT:exit:ok:Bridge shutting down"
            break
        }
        else {
            Write-Host "RESULT:unknown:err:Unknown command"
        }
    } catch {
        $errMsg = $_.Exception.Message -replace "`n"," " -replace "`r",""
        Write-Host "RESULT:error:err:$errMsg"
    }
}
