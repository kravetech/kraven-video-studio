param([string]$JobDir, [string]$Inspect)
$ErrorActionPreference = 'Stop'
if ($Inspect) {
    # Emit only the three P/Invoke declarations in memory. Read-only inspection
    # must not invoke the C# compiler or create temporary files on any drive.
    $assembly = [AppDomain]::CurrentDomain.DefineDynamicAssembly((New-Object Reflection.AssemblyName('JobQuery')), [Reflection.Emit.AssemblyBuilderAccess]::Run)
    $type = $assembly.DefineDynamicModule('JobQuery').DefineType('Native', 'Public')
    $definitions = @(
        @{ Name='OpenJobObjectW'; Return=[IntPtr]; Args=[Type[]]@([uint32],[bool],[string]) },
        @{ Name='QueryInformationJobObject'; Return=[bool]; Args=[Type[]]@([IntPtr],[int],[IntPtr],[uint32],[IntPtr]) },
        @{ Name='CloseHandle'; Return=[bool]; Args=[Type[]]@([IntPtr]) },
        @{ Name='GetLastError'; Return=[int]; Args=[Type[]]@() }
    )
    foreach ($d in $definitions) {
        $method = $type.DefinePInvokeMethod($d.Name, 'kernel32.dll', 'Public,Static,PinvokeImpl', 'Standard', $d.Return, $d.Args, 'Winapi', 'Unicode')
        $constructor = [Runtime.InteropServices.DllImportAttribute].GetConstructor([Type[]]@([string]))
        $field = [Runtime.InteropServices.DllImportAttribute].GetField('SetLastError')
        $attribute = New-Object Reflection.Emit.CustomAttributeBuilder($constructor, [object[]]@('kernel32.dll'), [Reflection.FieldInfo[]]@($field), [object[]]@($true))
        $method.SetCustomAttribute($attribute)
        $method.SetImplementationFlags('PreserveSig')
        if ($d.Name -eq 'OpenJobObjectW') { $open = $method }
        if ($d.Name -eq 'GetLastError') { $getError = $method }
    }
    $lastError = $type.DefineField('LastError', [int], 'Public,Static')
    $wrapper = $type.DefineMethod('Open', 'Public,Static', [IntPtr], [Type[]]@([string]))
    $il = $wrapper.GetILGenerator()
    $local = $il.DeclareLocal([IntPtr])
    $il.Emit([Reflection.Emit.OpCodes]::Ldc_I4_4)
    $il.Emit([Reflection.Emit.OpCodes]::Ldc_I4_0)
    $il.Emit([Reflection.Emit.OpCodes]::Ldarg_0)
    $il.Emit([Reflection.Emit.OpCodes]::Call, $open)
    $il.Emit([Reflection.Emit.OpCodes]::Stloc, $local)
    $il.Emit([Reflection.Emit.OpCodes]::Call, $getError)
    $il.Emit([Reflection.Emit.OpCodes]::Stsfld, $lastError)
    $il.Emit([Reflection.Emit.OpCodes]::Ldloc, $local)
    $il.Emit([Reflection.Emit.OpCodes]::Ret)
    $native = $type.CreateType()
    $handle = $native::Open($Inspect)
    if ($handle -eq [IntPtr]::Zero) {
        if ($native::LastError -eq 2) { Write-Output 0; exit 0 }
        throw "Job state could not be queried ($($native::LastError)); preserve cache."
    }
    $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal(48)
    try {
        if (-not $native::QueryInformationJobObject($handle, 1, $buffer, 48, [IntPtr]::Zero)) { throw 'Job accounting unavailable; preserve cache.' }
        [Runtime.InteropServices.Marshal]::ReadInt32($buffer, 40)
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer); $null = $native::CloseHandle($handle) }
    exit 0
}
# Compilation and PowerShell temporary files inherit the dedicated job/test temp.
Add-Type -Path (Join-Path $PSScriptRoot 'RenderGuard.cs')
$recordPath = Join-Path $JobDir 'job.json'
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$spec = Get-Content -LiteralPath (Join-Path $JobDir 'launch.json') -Raw | ConvertFrom-Json
$guard = $null
try {
    $guard = New-Object RenderGuard($record.guardName, $record.ownerPid, $record.createdAt, $spec.executable, [string[]]$spec.arguments, $spec.cwd)
    $record | Add-Member -NotePropertyName supervisorPid -NotePropertyValue $PID -Force
    $record | Add-Member -NotePropertyName workerPid -NotePropertyValue $guard.WorkerPid -Force
    $record | Add-Member -NotePropertyName guardAssigned -NotePropertyValue $true -Force
    $text = $record | ConvertTo-Json -Depth 12
    $temporary = Join-Path $JobDir '.guard-record.json'
    [IO.File]::WriteAllText($temporary, $text, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::Replace($temporary, $recordPath, [NullString]::Value)
    $guard.Resume()
    $guard.Wait((Join-Path $JobDir 'cancel.request'))
    $result = @{ reason=$guard.Reason; exitCode=$guard.ExitCode; stopped=$true; finishedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $JobDir 'guard-result.json'), $result, (New-Object Text.UTF8Encoding($false)))
    exit $guard.ExitCode
} finally { if ($guard) { $guard.Dispose() } }
