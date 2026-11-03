param([string]$Node, [string]$Entry, [string]$Ready, [string]$Report)
$ErrorActionPreference = 'Stop'
if (-not $env:KVS_TEST_RUN_DIR) { throw 'Run this helper through the isolated storage lifecycle tests.' }
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class ConsoleStop {
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint type, uint group);
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    public static int Code;
    public static string Output;
    public static void Run(string node, string entry, string ready) {
        SetConsoleCtrlHandler(IntPtr.Zero,false);
        var info=new ProcessStartInfo(node,"\""+entry+"\"");
        info.UseShellExecute=false; info.RedirectStandardOutput=true; info.RedirectStandardError=true;
        using(var child=Process.Start(info)) {
            var stdout=child.StandardOutput.ReadToEndAsync(); var stderr=child.StandardError.ReadToEndAsync();
            try {
                var end=DateTime.UtcNow.AddSeconds(20);
                while(!File.Exists(ready)&&!child.HasExited&&DateTime.UtcNow<end) Thread.Sleep(100);
                if(!File.Exists(ready)) throw new Exception("Console fixture did not become ready.");
                // Child installed its handler; ignore only this helper's own Ctrl+C.
                SetConsoleCtrlHandler(IntPtr.Zero,true);
                if(!GenerateConsoleCtrlEvent(0,0)) throw new Exception("Could not deliver a real console Ctrl+C.");
                if(!child.WaitForExit(20000)) throw new Exception("Studio did not stop after console Ctrl+C.");
                Code=child.ExitCode; Output=stdout.Result+stderr.Result;
            } finally { if(!child.HasExited) child.Kill(); }
        }
    }
}
'@
[ConsoleStop]::Run($Node,$Entry,$Ready)
[IO.File]::WriteAllText($Report, (@{code=[ConsoleStop]::Code;output=[ConsoleStop]::Output} | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
