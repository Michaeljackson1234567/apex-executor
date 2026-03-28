using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using QuorumAPI;

class ApexBridge
{
    static QuorumModule quorum;

    static async Task Main(string[] args)
    {
        try
        {
            quorum = new QuorumModule();
            QuorumAPI.QuorumModule.UseOutput(true);
            QuorumAPI.QuorumModule.Logger.OnLog += Quorum_OnLog;
            Send("ready", true, "Apex Bridge initialized with QuorumAPI");
        }
        catch (Exception ex)
        {
            Send("ready", false, "Failed to init QuorumAPI: " + ex.Message);
            return;
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
            }
        }
    }

    static void Send(string cmd, bool ok, string msg)
    {
        msg = msg.Replace("\"", "'");
        Console.WriteLine("RESULT:" + cmd + ":" + (ok ? "ok" : "err") + ":" + msg);
        Console.Out.Flush();
    }

    private static void Quorum_OnLog(string message)
    {
        Console.WriteLine($"RESULT:log:ok:{message.Replace("\n", " ").Replace("\r", "")}");
    }
}
