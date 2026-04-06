using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuorumAPI;

namespace ApexNative
{
    /// <summary>
    /// Shared engine that wraps QuorumAPI (Velocity) and provides all backend functionality.
    /// Called directly from MainForm — no bridge process, no IPC.
    /// </summary>
    public static class ApexEngine
    {
        private static QuorumModule? Velocity;
        private static int TargetPID = 0;
        private static bool _initialized = false;
        private static readonly HttpClient http = new HttpClient();
        private static string SavedScriptsDir = "";

        private const string GITHUB_REPO = "Michaeljackson1234567/apex-executor";
        private const string GITHUB_BRANCH = "Guesspapers-AI";
        private static string GITHUB_RAW => $"https://raw.githubusercontent.com/{GITHUB_REPO}/{GITHUB_BRANCH}";

        public static void Initialize()
        {
            if (_initialized) return;
            Velocity = new QuorumModule();
            QuorumModule._AutoUpdateLogs = false;
            Velocity.StartCommunication();
            _initialized = true;

            SavedScriptsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "ApexExecutor", "saved_scripts");
            Directory.CreateDirectory(SavedScriptsDir);

            http.DefaultRequestHeaders.UserAgent.ParseAdd("ApexExecutor/2.0");
        }

        // ─── INJECT ────────────────────────────────────────────────────
        public static async Task<JObject> Attach()
        {
            try
            {
                await Task.Run(() => {
                    Velocity!.AttachAPI();
                });
                bool attached = Velocity!.IsAttached();

                if (attached)
                    return JObject.FromObject(new { success = true, message = "Attached to Roblox successfully!" });
                else
                    return JObject.FromObject(new { success = false, message = "Attach completed but injection state unclear." });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = "Injection error: " + ex.Message });
            }
        }

        // ─── EXECUTE ───────────────────────────────────────────────────
        public static JObject Execute(string script)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(script))
                    return JObject.FromObject(new { success = false, message = "Empty script." });

                Task.Run(() => Velocity!.ExecuteScript(script));
                return JObject.FromObject(new { success = true, message = "Script executed successfully" });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = "Execute error: " + ex.Message });
            }
        }

        // ─── ROBLOX CHECK ──────────────────────────────────────────────
        public static bool IsRobloxRunning()
        {
            return Process.GetProcessesByName("RobloxPlayerBeta").Length > 0;
        }

        // ─── ROBLOX USER ──────────────────────────────────────────────
        public static async Task<JObject> GetRobloxUser()
        {
            try
            {
                string logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Roblox", "logs");
                if (!Directory.Exists(logDir))
                    return JObject.FromObject(new { success = false, message = "Roblox logs not found" });

                var logs = new DirectoryInfo(logDir).GetFiles("*.log")
                    .OrderByDescending(f => f.LastWriteTime).Take(5);

                string? userId = null;
                var patterns = new[] {
                    @"userId:\s*(\d{5,})",
                    @"UserId[=:]\s*(\d{5,})",
                    @"initializeUser.*?(\d{7,})",
                    @"localuserid[=:\s]+(\d{5,})",
                    @"""userId"":(\d{5,})"
                };

                foreach (var log in logs)
                {
                    string content = File.ReadAllText(log.FullName);
                    foreach (var p in patterns)
                    {
                        var m = Regex.Match(content, p, RegexOptions.IgnoreCase);
                        if (m.Success) { userId = m.Groups[1].Value; break; }
                    }
                    if (userId != null) break;
                }

                if (userId == null)
                    return JObject.FromObject(new { success = false, message = "Could not find Roblox user ID" });

                var userInfo = JObject.Parse(await http.GetStringAsync($"https://users.roblox.com/v1/users/{userId}"));
                var thumbData = JObject.Parse(await http.GetStringAsync($"https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={userId}&size=150x150&format=Png&isCircular=true"));

                string avatarUrl = "";
                var data = thumbData["data"] as JArray;
                if (data?.Count > 0) avatarUrl = data[0]?["imageUrl"]?.ToString() ?? "";

                return JObject.FromObject(new
                {
                    success = true,
                    user = new
                    {
                        id = userId,
                        name = userInfo["name"]?.ToString() ?? "Player",
                        displayName = userInfo["displayName"]?.ToString() ?? userInfo["name"]?.ToString() ?? "Player",
                        avatarUrl
                    }
                });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        // ─── SCRIPTS HUB ──────────────────────────────────────────────
        public static async Task<JObject> SearchScripts(string query, int page)
        {
            try
            {
                string q = Uri.EscapeDataString(query ?? "");
                string url = $"https://rscripts.net/api/v2/scripts?q={q}&page={page}";
                string json = await http.GetStringAsync(url);
                return JObject.FromObject(new { success = true, data = JObject.Parse(json) });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        public static async Task<JObject> FetchScripts(int page)
        {
            try
            {
                string url = $"https://rscripts.net/api/v2/scripts?page={page}";
                string json = await http.GetStringAsync(url);
                return JObject.FromObject(new { success = true, data = JObject.Parse(json) });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        public static async Task<JObject> FetchRawScript(string rawUrl)
        {
            try
            {
                string code = await http.GetStringAsync(rawUrl);
                return JObject.FromObject(new { success = true, code });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        // ─── SAVED SCRIPTS ────────────────────────────────────────────
        public static JObject SaveScript(string name, string code)
        {
            try
            {
                string safeName = Regex.Replace(name, @"[^a-zA-Z0-9_\- ]", "").Trim();
                if (string.IsNullOrEmpty(safeName)) safeName = "untitled";
                File.WriteAllText(Path.Combine(SavedScriptsDir, safeName + ".lua"), code);
                return JObject.FromObject(new { success = true, message = $"Saved \"{safeName}.lua\"" });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        public static JObject GetSavedScripts()
        {
            try
            {
                var files = Directory.GetFiles(SavedScriptsDir, "*.lua");
                var scripts = files.Select(f =>
                {
                    var fi = new FileInfo(f);
                    return new
                    {
                        name = Path.GetFileNameWithoutExtension(f),
                        filename = fi.Name,
                        code = File.ReadAllText(f),
                        size = fi.Length,
                        modified = fi.LastWriteTime.ToString("o")
                    };
                }).ToArray();
                return JObject.FromObject(new { success = true, scripts });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, scripts = Array.Empty<object>(), message = ex.Message });
            }
        }

        public static JObject DeleteScript(string filename)
        {
            try
            {
                string path = Path.Combine(SavedScriptsDir, filename);
                if (File.Exists(path)) File.Delete(path);
                return JObject.FromObject(new { success = true, message = $"Deleted \"{filename}\"" });
            }
            catch (Exception ex)
            {
                return JObject.FromObject(new { success = false, message = ex.Message });
            }
        }

        public static void OpenScriptsFolder()
        {
            try { Process.Start("explorer.exe", SavedScriptsDir); } catch { }
        }

        // ─── VERSION / UPDATE ──────────────────────────────────────────
        private static string VersionFilePath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ApexExecutor", "apex_version.json");

        private static string ChangelogFilePath =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ApexExecutor", "apex_changelog.json");

        public static string GetLocalVersion()
        {
            try
            {
                if (File.Exists(VersionFilePath))
                {
                    var j = JObject.Parse(File.ReadAllText(VersionFilePath));
                    return j["version"]?.ToString() ?? "1.0.0";
                }
            }
            catch { }
            return "1.0.0";
        }

        public static async Task CheckAndUpdate(Action<string, int> onStatus)
        {
            try
            {
                string remoteJson = await http.GetStringAsync($"{GITHUB_RAW}/version.json");
                var remote = JObject.Parse(remoteJson);
                string remoteVer = remote["version"]?.ToString() ?? "";
                string localVer = GetLocalVersion();

                if (!string.IsNullOrEmpty(remoteVer) && remoteVer != localVer)
                {
                    onStatus($"Update found: v{localVer} → v{remoteVer}", -1);
                    // For now just update version tracker, actual file update not needed
                    // since native app doesn't auto-update its own exe
                    File.WriteAllText(VersionFilePath,
                        JsonConvert.SerializeObject(new { version = remoteVer, updatedAt = DateTime.UtcNow }, Formatting.Indented));

                    // Save changelog
                    var changelog = remote["changelog"] as JArray;
                    if (changelog != null)
                    {
                        File.WriteAllText(ChangelogFilePath,
                            JsonConvert.SerializeObject(new { version = remoteVer, changelog, shown = false }, Formatting.Indented));
                    }

                    onStatus($"Updated to v{remoteVer} ✓", 100);
                }
                else
                {
                    onStatus("Up to date ✓", 100);
                }
            }
            catch
            {
                onStatus("Offline mode", 100);
            }
        }

        public static JObject GetPendingChangelog()
        {
            try
            {
                if (File.Exists(ChangelogFilePath))
                {
                    var data = JObject.Parse(File.ReadAllText(ChangelogFilePath));
                    if (data["shown"]?.Value<bool>() == false)
                    {
                        var cl = data["changelog"] as JArray;
                        if (cl?.Count > 0)
                            return JObject.FromObject(new { success = true, version = data["version"]?.ToString(), changelog = cl });
                    }
                }
            }
            catch { }
            return JObject.FromObject(new { success = false });
        }

        public static void MarkChangelogSeen()
        {
            try
            {
                if (File.Exists(ChangelogFilePath))
                {
                    var data = JObject.Parse(File.ReadAllText(ChangelogFilePath));
                    data["shown"] = true;
                    File.WriteAllText(ChangelogFilePath, data.ToString());
                }
            }
            catch { }
        }

        public static void Shutdown()
        {
            try { Velocity?.StopCommunication(); } catch { }
        }
    }
}
