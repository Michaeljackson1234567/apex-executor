using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ApexNative
{
    public class BootstrapperForm : Form
    {
        private WebView2 webView;

        public BootstrapperForm()
        {
            this.Text = "Apex Executor";
            this.Width = 420;
            this.Height = 520;
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = System.Drawing.Color.FromArgb(5, 5, 7);
            this.ShowInTaskbar = true;

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(5, 5, 7);
            this.Controls.Add(webView);

            this.Load += async (s, e) => await InitAsync();
        }

        private async Task InitAsync()
        {
            var options = new CoreWebView2EnvironmentOptions("--disable-gpu --disable-gpu-compositing --disable-software-rasterizer");
            var env = await CoreWebView2Environment.CreateAsync(null, 
                Path.Combine(Path.GetTempPath(), "ApexWebView2"), options);
            await webView.EnsureCoreWebView2Async(env);

            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot", "bootstrapper.html");
            if (File.Exists(htmlPath))
                webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
            else
                webView.CoreWebView2.NavigateToString("<html><body style='background:#050507;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><h2>Loading Apex...</h2></body></html>");

            // Run boot sequence
            await Task.Delay(500);
            SendStatus("Initializing Apex Executor...");
            await Task.Delay(800);

            // Initialize QuorumAPI
            SendStatus("Starting Quorum API...");
            try
            {
                ApexEngine.Initialize();
                SendStatus("Engine ready ✓", "ok");
            }
            catch (Exception ex)
            {
                SendStatus("Engine init warning: " + ex.Message, "err");
            }
            await Task.Delay(600);

            // Check for updates
            SendStatus("Checking for updates...");
            try
            {
                await ApexEngine.CheckAndUpdate((msg, pct) =>
                {
                    this.Invoke(() => SendStatus(msg, "", pct));
                });
            }
            catch { }
            await Task.Delay(400);

            SendStatus("Launching Apex Executor...", "ok", 100);
            await Task.Delay(500);

            // Open main form
            var main = new MainForm();
            main.Show();
            this.Hide();
            main.FormClosed += (s, e) => { this.Close(); };
        }

        private void SendStatus(string text, string type = "", int progress = -1)
        {
            try
            {
                string js;
                if (progress >= 0)
                    js = $"if(window.setBootStatus)window.setBootStatus('{EscapeJs(text)}','{type}',{progress});";
                else
                    js = $"if(window.setBootStatus)window.setBootStatus('{EscapeJs(text)}','{type}',-1);";
                webView.CoreWebView2.ExecuteScriptAsync(js);
            }
            catch { }
        }

        private string EscapeJs(string s) =>
            s.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\n", "\\n").Replace("\r", "");
    }
}
