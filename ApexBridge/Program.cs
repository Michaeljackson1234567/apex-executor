using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using QuorumAPI;

namespace QuorumBridge
{
    class Program
    {
        static QuorumModule quorum;

        static void Log(string message)
        {
            try { File.AppendAllText("ApexLog.txt", $"[{DateTime.Now:HH:mm:ss}] {message}\n"); } catch { }
        }

        static async Task Main(string[] args)
        {
            Log("Bridge started.");
            try
            {
                Log("Initializing QuorumModule.");
                quorum = new QuorumModule();
                QuorumAPI.QuorumModule._AutoUpdateLogs = false;
                Log("Starting communication.");
                quorum.StartCommunication();
            }
            catch (Exception ex)
            {
                Log("INIT ERROR: " + ex.Message);
            }

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                try
                {
                    JObject obj = JObject.Parse(line);
                    string action = obj["action"]?.ToString();
                    await HandleAction(action, obj);
                }
                catch (Exception ex)
                {
                    Log("LOOP ERROR: " + ex.Message);
                    Send(false, "error", null, ex.Message);
                }
            }

            Log("Bridge exiting.");
            quorum?.StopCommunication();
        }

        static async Task HandleAction(string action, JObject payload)
        {
            switch (action)
            {
                case "attach":
                    try
                    {
                        Log("Received 'attach' action.");
                        try
                        {
                            string binPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Bin", "erto3e4rortoergn.exe");
                            Log("Checking background service: " + binPath);
                            if (File.Exists(binPath) && Process.GetProcessesByName("erto3e4rortoergn").Length == 0)
                            {
                                Log("Starting background service...");
                                Process.Start(new ProcessStartInfo
                                {
                                    FileName = binPath,
                                    UseShellExecute = true
                                });
                                Log("Started background service.");
                            }
                            else
                            {
                                Log("Background service already running or file missing.");
                            }
                        }
                        catch (Exception ex)
                        {
                            Log("Process Start error: " + ex.ToString());
                        }

                        Log("Calling quorum.AttachAPI()...");
                        await quorum.AttachAPI();
                        Log("quorum.AttachAPI() finished successfully.");
                        
                        bool attached = quorum.IsAttached();
                        Log("IsAttached: " + attached);
                        string state = attached ? "Attached" : "Detached";
                        Send(attached, "attach", "{\"state\":\"" + state + "\"}", "");
                    }
                    catch (Exception ex)
                    {
                        Log("ATTACH ERROR: " + ex.ToString());
                        Send(false, "attach", null, ex.Message);
                    }
                    break;

                case "execute":
                    try
                    {
                        var data = payload["data"] as JObject;
                        string script = data?["script"]?.ToString() ?? "";
                        if (string.IsNullOrEmpty(script)) throw new Exception("Script payload the empty");

                        quorum.ExecuteScript(script);
                        Send(true, "execute", null, "");
                    }
                    catch (Exception ex)
                    {
                        Send(false, "execute", null, ex.Message);
                    }
                    break;

                case "is_attached":
                    try
                    {
                        bool attached = quorum.IsAttached();
                        Send(true, "is_attached", "{\"attached\":" + (attached ? "true" : "false") + "}", "");
                    }
                    catch (Exception ex)
                    {
                        Send(false, "is_attached", null, ex.Message);
                    }
                    break;
                    
                default:
                    Send(false, action, null, "Unknown action");
                    break;
            }
        }

        static void Send(bool success, string action, string dataJson, string error)
        {
            string data = dataJson ?? "null";
            string errEscaped = (error ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
            string json = "{\"success\":" + (success ? "true" : "false")
                + ",\"action\":\"" + action
                + "\",\"data\":" + data
                + ",\"error\":\"" + errEscaped + "\"}";
            
            Console.WriteLine(json);
            Console.Out.Flush();
        }
    }
}
