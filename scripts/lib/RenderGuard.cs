// Windows process containment. Handles are not inherited; children cannot break away.
// https://learn.microsoft.com/windows/win32/procthread/job-objects
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class RenderGuard : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long A, B, C, D; public uint Faults, Total, Active, Terminated;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
        public uint Size; public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public ushort Show, ReservedSize; public IntPtr ReservedPtr, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int type, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupInfo start, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    IntPtr job; ProcessInfo worker; Process owner;
    public int WorkerPid { get { return (int)worker.Pid; } }
    public string Reason { get; private set; }
    public int ExitCode { get; private set; }
    static void Require(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string value) {
        var output=new StringBuilder("\""); int slashes=0;
        foreach(char c in value) {
            if(c=='\\') { slashes++; continue; }
            if(c=='\"') { output.Append('\\',slashes*2+1); output.Append(c); }
            else { output.Append('\\',slashes); output.Append(c); }
            slashes=0;
        }
        output.Append('\\',slashes*2); return output.Append('"').ToString();
    }
    public static int Active(string name) {
        IntPtr handle=OpenJobObject(4,false,name);
        if(handle==IntPtr.Zero) {
            if(Marshal.GetLastWin32Error()==2) return 0;
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        try { Accounting info; Require(QueryInformationJobObject(handle,1,out info,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); return (int)info.Active; }
        finally { CloseHandle(handle); }
    }
    public RenderGuard(string name, int ownerPid, string createdAt, string executable, string[] arguments, string cwd) {
        try {
            owner=Process.GetProcessById(ownerPid);
            // Opening the handle pins this process identity across PID reuse.
            IntPtr ownerHandle=owner.Handle;
            if(owner.HasExited || owner.StartTime.ToUniversalTime()>DateTime.Parse(createdAt).ToUniversalTime()) throw new Exception("Render owner is no longer available.");
            job=CreateJobObject(IntPtr.Zero,name); Require(job!=IntPtr.Zero);
            if(Marshal.GetLastWin32Error()==183) throw new Exception("Render guard already exists.");
            var limits=new ExtendedLimits(); limits.Basic.Flags=0x2000;
            Require(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            var start=new StartupInfo(); start.Size=(uint)Marshal.SizeOf(typeof(StartupInfo)); start.Flags=0x100;
            start.Input=GetStdHandle(-10); start.Output=GetStdHandle(-11); start.Error=GetStdHandle(-12);
            var command=new StringBuilder(Quote(executable)); foreach(string arg in arguments) command.Append(" ").Append(Quote(arg));
            // Suspended until the ownership record is durable and containment is established.
            Require(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,cwd,ref start,out worker));
            Require(AssignProcessToJobObject(job,worker.Process));
        } catch { Dispose(); throw; }
    }
    public void Resume() {
        if(owner.HasExited) throw new Exception("Render owner exited before startup.");
        if(ResumeThread(worker.Thread)==0xffffffff) throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public void Wait(string cancelFile) {
        while(true) {
            if(owner.HasExited) { Reason="abandoned"; ExitCode=1; break; }
            if(File.Exists(cancelFile)) { Reason="cancelled"; ExitCode=130; break; }
            uint state=WaitForSingleObject(worker.Process,150);
            if(state==0) { uint code; Require(GetExitCodeProcess(worker.Process,out code)); ExitCode=unchecked((int)code); Reason=code==0?"complete":"failed"; break; }
            if(state!=258) throw new Exception("Could not wait for render worker.");
        }
        // End remaining Chrome/FFmpeg descendants even when the main worker exited first.
        Require(TerminateJobObject(job,1));
        for(int i=0;i<200;i++) {
            Accounting info; Require(QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));
            if(info.Active==0) return;
            Thread.Sleep(50);
        }
        throw new Exception("Render descendants have not stopped; preserve cache.");
    }
    public void Dispose() {
        // Also covers errors before assignment or resume; never leave a suspended worker behind.
        if(worker.Process!=IntPtr.Zero) { TerminateProcess(worker.Process,1); CloseHandle(worker.Process); worker.Process=IntPtr.Zero; }
        if(worker.Thread!=IntPtr.Zero) { CloseHandle(worker.Thread); worker.Thread=IntPtr.Zero; }
        if(job!=IntPtr.Zero) { CloseHandle(job); job=IntPtr.Zero; }
        if(owner!=null) { owner.Dispose(); owner=null; }
    }
}
