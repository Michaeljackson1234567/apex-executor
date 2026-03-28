using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using QuorumAPI;

class ApexBridge
{
    static QuorumModule quorum;

    static async Task Main(string[] args)
    {
        // Log the working directory for debugging
        Console.Error.WriteLine("[ApexBridge] CWD: " + Environment.CurrentDirectory);
        Console.Error.WriteLine("[ApexBridge] EXE Dir: " + AppDomain.CurrentDomain.BaseDirectory);
        
        string dllCheck = Path.Combine(Environment.CurrentDirectory, "QuorumAPI.dll");
        Console.Error.WriteLine("[ApexBridge] QuorumAPI.dll exists: " + File.Exists(dllCheck));

        try
        {
            quorum = new QuorumModule();
            quorum.StartCommunication(); // REQUIRED FOR EXECUTION!
            Send("ready", true, "Apex Bridge initialized with Apex API");
        }
        catch (Exception ex)
        {
            Send("ready", false, "Failed to init Apex API: " + ex.Message);
            Console.Error.WriteLine("[ApexBridge] INIT EXCEPTION: " + ex.ToString());
            return;
        }

        // Enable output logging
        try
        {
            QuorumAPI.QuorumModule.UseOutput(true);
            QuorumAPI.QuorumModule.Logger.OnLog += Quorum_OnLog;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[ApexBridge] Logger setup failed (non-fatal): " + ex.Message);
        }

        string line;
        while ((line = Console.ReadLine()) != null)
        {
            line = line.Trim();
            if (string.IsNullOrEmpty(line)) continue;

            try
            {
                if (line.StartsWith("ATTACH"))
                {
                    await quorum.AttachAPI();
                    Send("attach", true, "Successfully attached to Roblox");
                }
                else if (line.StartsWith("EXECUTE:"))
                {
                    string b64 = line.Substring(8);
                    string script = Encoding.UTF8.GetString(Convert.FromBase64String(b64));
                    quorum.ExecuteScript(script);
                    Send("execute", true, "Script executed successfully");
                }
                else if (line.StartsWith("STATUS"))
                {
                    bool isAttached = quorum.IsAttached();
                    Send("status", isAttached, isAttached ? "Attached" : "Not Attached");
                }
                else if (line.StartsWith("AUTOATTACH:"))
                {
                    bool val = line.Substring(11).Trim().ToLower() == "true";
                    quorum.SetAutoAttach(val);
                    Send("autoattach", true, "Auto-attach set to " + val);
                }
                else if (line.StartsWith("KILL"))
                {
                    QuorumAPI.QuorumModule.KillRoblox();
                    Send("kill", true, "Roblox process killed");
                }
                else if (line.StartsWith("PING"))
                {
                    Send("ping", true, "pong");
                }
                else if (line.StartsWith("EXIT"))
                {
                    Send("exit", true, "Bridge shutting down");
                    break;
                }
                else
                {
                    Send("unknown", false, "Unknown command: " + line);
                }
            }
            catch (Exception ex)
            {
                string cmd = line.Contains(":") ? line.Substring(0, line.IndexOf(':')) : line;
                Send(cmd.ToLower(), false, ex.Message.Replace("\n", " ").Replace("\r", ""));
                Console.Error.WriteLine("[ApexBridge] CMD EXCEPTION: " + ex.ToString());
            }
        }
    }

    static void Send(string cmd, bool ok, string msg)
    {
        msg = msg.Replace("\"", "'");
        Console.WriteLine("RESULT:" + cmd + ":" + (ok ? "ok" : "err") + ":" + msg);
        Console.Out.Flush();
    }

    private static void Quorum_OnLog(string message, Color color)
    {
        Console.WriteLine($"RESULT:log:ok:{message.Replace("\n", " ").Replace("\r", "")}");
        Console.Out.Flush();
    }
}
