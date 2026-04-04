using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ApexNative
{
    public class MainForm : Form
    {
        private WebView2 webView;
        private bool isAlwaysOnTop = false;

        public MainForm()
        {
            this.Text = "Apex Executor";
            this.Width = 1200;
            this.Height = 780;
            this.MinimumSize = new Size(900, 600);
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(9, 9, 11);

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = Color.FromArgb(9, 9, 11);
            this.Controls.Add(webView);

            this.Load += async (s, e) => await InitAsync();
            this.FormClosed += (s, e) => ApexEngine.Shutdown();
        }

        private async Task InitAsync()
        {
            var env = await CoreWebView2Environment.CreateAsync(null,
                Path.Combine(Path.GetTempPath(), "ApexWebView2"));
            await webView.EnsureCoreWebView2Async(env);

            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true; // For debugging
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            // Handle messages from JavaScript
            webView.CoreWebView2.WebMessageReceived += OnWebMessage;

            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot", "index.html");
            if (File.Exists(htmlPath))
                webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
        }

        private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                var msg = JObject.Parse(e.WebMessageAsJson);
                string action = msg["action"]?.ToString() ?? "";
                string id = msg["id"]?.ToString() ?? "";

                JObject result;

                switch (action)
                {
                    case "win-minimize":
                        this.WindowState = FormWindowState.Minimized;
                        return;
                    case "win-maximize":
                        this.WindowState = this.WindowState == FormWindowState.Maximized
                            ? FormWindowState.Normal : FormWindowState.Maximized;
                        return;
                    case "win-close":
                        this.Close();
                        return;

                    case "inject":
                        result = await ApexEngine.Attach();
                        break;

                    case "execute-script":
                        string script = msg["data"]?["script"]?.ToString() ?? "";
                        result = ApexEngine.Execute(script);
                        break;

                    case "check-roblox":
                        result = JObject.FromObject(new { running = ApexEngine.IsRobloxRunning() });
                        break;

                    case "get-roblox-user":
                        result = await ApexEngine.GetRobloxUser();
                        break;

                    case "search-scripts":
                        string q = msg["data"]?["query"]?.ToString() ?? "";
                        int sp = msg["data"]?["page"]?.Value<int>() ?? 1;
                        result = await ApexEngine.SearchScripts(q, sp);
                        break;

                    case "fetch-scripts":
                        int fp = msg["data"]?["page"]?.Value<int>() ?? 1;
                        result = await ApexEngine.FetchScripts(fp);
                        break;

                    case "fetch-raw-script":
                        string rawUrl = msg["data"]?["url"]?.ToString() ?? "";
                        result = await ApexEngine.FetchRawScript(rawUrl);
                        break;

                    case "save-script":
                        string sName = msg["data"]?["name"]?.ToString() ?? "";
                        string sCode = msg["data"]?["code"]?.ToString() ?? "";
                        result = ApexEngine.SaveScript(sName, sCode);
                        break;

                    case "get-saved-scripts":
                        result = ApexEngine.GetSavedScripts();
                        break;

                    case "delete-script":
                        string dFile = msg["data"]?["filename"]?.ToString() ?? "";
                        result = ApexEngine.DeleteScript(dFile);
                        break;

                    case "open-scripts-folder":
                        ApexEngine.OpenScriptsFolder();
                        result = JObject.FromObject(new { success = true });
                        break;

                    case "set-topmost":
                        isAlwaysOnTop = msg["data"]?["value"]?.Value<bool>() ?? false;
                        this.TopMost = isAlwaysOnTop;
                        result = JObject.FromObject(new { success = true });
                        break;

                    case "set-opacity":
                        double op = msg["data"]?["value"]?.Value<double>() ?? 1.0;
                        this.Opacity = Math.Max(0.3, Math.Min(1.0, op));
                        result = JObject.FromObject(new { success = true });
                        break;

                    case "get-version":
                        result = JObject.FromObject(new { version = ApexEngine.GetLocalVersion() });
                        break;

                    case "check-for-update":
                        // Simplified — just return current version
                        result = JObject.FromObject(new { success = true, hasUpdate = false, currentVersion = ApexEngine.GetLocalVersion() });
                        break;

                    case "get-pending-changelog":
                        result = ApexEngine.GetPendingChangelog();
                        break;

                    case "mark-changelog-seen":
                        ApexEngine.MarkChangelogSeen();
                        result = JObject.FromObject(new { success = true });
                        break;

                    default:
                        result = JObject.FromObject(new { success = false, message = "Unknown action: " + action });
                        break;
                }

                // Send response back to JS
                var response = new JObject
                {
                    ["id"] = id,
                    ["action"] = action,
                    ["result"] = result
                };
                SendToWeb(response.ToString(Formatting.None));
            }
            catch (Exception ex)
            {
                var errResp = new JObject
                {
                    ["id"] = "",
                    ["action"] = "error",
                    ["result"] = JObject.FromObject(new { success = false, message = ex.Message })
                };
                SendToWeb(errResp.ToString(Formatting.None));
            }
        }

        private void SendToWeb(string json)
        {
            try
            {
                webView.CoreWebView2.PostWebMessageAsString(json);
            }
            catch { }
        }

        // Allow dragging the frameless window
        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            // WM_NCHITTEST
            if (m.Msg == 0x84 && m.Result == (IntPtr)1)
            {
                // Allow resize from edges
                Point cursor = this.PointToClient(Cursor.Position);
                if (cursor.Y < 36) // Titlebar area
                    m.Result = (IntPtr)2; // HTCAPTION — enables drag
            }
        }
    }
}
