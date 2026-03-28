using System;
using System.Threading.Tasks;
using System.Diagnostics;
using System.IO;
using QuorumAPI;

namespace ApexBridge
{
    class Program
    {
        private static QuorumModule quorum;

        static async Task Main(string[] args)
        {
            quorum = new QuorumModule();
            QuorumAPI.QuorumModule._AutoUpdateLogs = false;
            quorum.StartCommunication();

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    string action = ExtractValue(line, "action");
                    await HandleAction(action, line);
                }
                catch (Exception ex)
                {
                    Send(false, "error", null, ex.Message);
                }
            }

            quorum.StopCommunication();
        }

        static string ExtractValue(string json, string key)
        {
            string search = "\"" + key + "\":\"";
            int start = json.IndexOf(search);
            if (start == -1) return "";
            start += search.Length;
            int end = json.IndexOf("\"", start);
            if (end == -1) return "";
            return json.Substring(start, end - start);
        }

        static string ExtractScript(string json)
        {
            string search = "\"script\":\"";
            int start = json.IndexOf(search);
            if (start == -1) return "";
            start += search.Length;

            int end = start;
            while (end < json.Length)
            {
                if (json[end] == '\\')
                {
                    end += 2;
                    continue;
                }
                if (json[end] == '"')
                    break;
                end++;
            }

            string raw = json.Substring(start, end - start);
            raw = raw.Replace("\\\\", "\0");
            raw = raw.Replace("\\n", "\n");
            raw = raw.Replace("\\r", "\r");
            raw = raw.Replace("\\t", "\t");
            raw = raw.Replace("\\\"", "\"");
            raw = raw.Replace("\0", "\\");
            return raw;
        }

        static async Task HandleAction(string action, string raw)
        {
            switch (action)
            {
                case "attach":
                    try
                    {
                        try
                        {
                            string binPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin", "erto3e4rortoergn.exe");
                            if (File.Exists(binPath) && Process.GetProcessesByName("erto3e4rortoergn").Length == 0)
                            {
                                Process.Start(new ProcessStartInfo
                                {
                                    FileName = binPath,
                                    UseShellExecute = true
                                });
                            }
                        }
                        catch { }

                        await quorum.AttachAPI();
                        bool attached = quorum.IsAttached();
                        string state = attached ? "Attached" : "Detached";
                        Send(attached, "attach", "{\"state\":\"" + state + "\"}", "");
                    }
                    catch (Exception ex)
                    {
                        Send(false, "attach", null, ex.Message);
                    }
                    break;

                case "execute":
                    try
                    {
                        string script = ExtractScript(raw);
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
